import asyncio
# pyrefly: ignore [missing-import]
from fastapi import FastAPI, Request, Form, Response, Cookie, HTTPException, Depends, UploadFile, File
# pyrefly: ignore [missing-import]
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse
# pyrefly: ignore [missing-import]
from fastapi.templating import Jinja2Templates
# pyrefly: ignore [missing-import]
from fastapi.staticfiles import StaticFiles
import yt_dlp
import os
import shutil
import json
import re
import html
import ssl
import urllib.parse
import urllib.request
import certifi
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import smtplib

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
templates = Jinja2Templates(directory="templates")

# Global state for progress
current_progress = {"percent": 0, "status": "idle", "filename": "", "message": "", "metadata": None}

# --- Persistence Logic ---
USERS_FILE = "users.json"
HISTORY_FILE = "history.json"
AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 180
LYRICS_CACHE = {}
LRC_TIMESTAMP_RE = re.compile(r"\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]")
LYRICS_MAX_LINES = 320
LYRICS_SEARCH_TIMEOUT = 6
LYRICS_MAX_SEARCHES = 12
LYRICS_BRACKET_NOISE_RE = re.compile(
    r"[\(\[][^\)\]]*(official|music video|video|audio|lyrics?|lyric|visualizer|clean|explicit|"
    r"sped up|slowed|remix|remaster(?:ed)?|karaoke)[^\)\]]*[\)\]]",
    re.I,
)
LYRICS_FEATURE_BRACKET_RE = re.compile(r"[\(\[][^\)\]]*(feat\.?|ft\.?|featuring|with)[^\)\]]*[\)\]]", re.I)
LYRICS_FEATURE_SUFFIX_RE = re.compile(r"\s+(?:feat\.?|ft\.?|featuring|with)\s+.+$", re.I)
LYRICS_TRAILING_NOISE_RE = re.compile(
    r"\s+(?:official\s+)?(?:music\s+)?(?:video|audio|visualizer|lyrics?|lyric)$",
    re.I,
)
LYRICS_SPLIT_RE = re.compile(r"\s[-–—]\s|\s\|\s")
LRCLIB_SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())

def set_auth_cookie(response: Response, value: str):
    response.set_cookie(
        key="auth_token",
        value=value,
        httponly=True,
        max_age=AUTH_COOKIE_MAX_AGE,
        samesite="lax",
        path="/",
    )

def load_data():
    global users_db, usernames_set, history_db
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE, "r") as f:
            users_db = json.load(f)
            usernames_set = {u["username"] for u in users_db.values()}
    else:
        users_db = {"admin@example.com": {"password": "password", "username": "admin"}}
        usernames_set = {"admin"}
        save_users()

    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, "r") as f:
            history_db = json.load(f)
    else:
        history_db = {"admin@example.com": []}
        save_history()

def save_users():
    with open(USERS_FILE, "w") as f:
        json.dump(users_db, f)

def save_history():
    with open(HISTORY_FILE, "w") as f:
        json.dump(history_db, f)

# Initial load
users_db = {}
usernames_set = set()
history_db = {}
load_data()

async def send_confirmation_email(user_email: str):
    sender_email = os.environ.get("SMTP_EMAIL", "reanwrld@gmail.com")
    password = os.environ.get("SMTP_PASSWORD")
    
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Welcome to Audio Dashboard!"
    msg["From"] = sender_email if sender_email else "noreply@audiodashboard.com"
    msg["To"] = user_email
    
    text = "Thank you for creating an account. Please verify your email to unlock premium features."
    part1 = MIMEText(text, "plain")
    msg.attach(part1)
    
    # Read the premium HTML template
    template_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates", "email_verification.html")
    try:
        with open(template_path, "r", encoding="utf-8") as f:
            html = f.read()
        part2 = MIMEText(html, "html")
        msg.attach(part2)
    except Exception as e:
        print(f"Failed to attach HTML email template: {e}")
        
    if sender_email and password:
        try:
            def _send():
                with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                    server.login(sender_email, password)
                    server.sendmail(sender_email, user_email, msg.as_string())
            await asyncio.to_thread(_send)
            print(f"📧 Real confirmation email sent to {user_email}")
        except Exception as e:
            print(f"❌ Failed to send real email: {e}")
    else:
        print(f"\n{'='*50}")
        print("📧 CAPTURED REAL EMAIL IN TERMINAL (No SMTP config found):")
        print(msg.as_string())
        print(f"{'='*50}\n")
        print("⚠️ WARNING: To send over the network, set SMTP_EMAIL and SMTP_PASSWORD.")

def get_current_user(auth_token: str = Cookie(None)):
    if auth_token == "guest_session":
        return "guest"
    if auth_token and auth_token.startswith("session_"):
        email = auth_token.split("session_")[1]
        return email
    raise HTTPException(status_code=401, detail="Unauthorized")

@app.post("/login")
async def login(response: Response, email: str = Form(...), password: str = Form(...)):
    email = email.strip().lower()
    if email in users_db and users_db[email]["password"] == password:
        set_auth_cookie(response, f"session_{email}")
        return {"status": "success"}
    raise HTTPException(status_code=401, detail="Invalid email or password")

@app.post("/signup")
async def signup(response: Response, email: str = Form(...), password: str = Form(...), username: str = Form(...)):
    email = email.strip().lower()
    if email in users_db:
        raise HTTPException(status_code=400, detail="Email already registered")
    if username in usernames_set:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    users_db[email] = {"password": password, "username": username}
    usernames_set.add(username)
    history_db[email] = []
    save_users()
    save_history()
    
    # Fire off confirmation email in the background
    asyncio.create_task(send_confirmation_email(email))
    
    set_auth_cookie(response, f"session_{email}")
    return {"status": "success"}

@app.post("/guest-login")
async def guest_login(response: Response):
    set_auth_cookie(response, "guest_session")
    return {"status": "success"}

@app.post("/logout")
async def logout(response: Response):
    response.delete_cookie("auth_token", path="/")
    return {"status": "success"}

@app.get("/check-auth")
async def check_auth(auth_token: str = Cookie(None)):
    if auth_token == "guest_session":
        return {"status": "authenticated", "role": "guest", "user": "Guest"}
    elif auth_token and auth_token.startswith("session_"):
        email = auth_token.split("session_")[1]
        user_data = users_db.get(email, {})
        username = user_data.get("username", email)
        profile_pic = user_data.get("profile_pic", None)
        if profile_pic:
            profile_pic = f"{profile_pic}?t={int(datetime.now().timestamp())}"
        return {"status": "authenticated", "role": "user", "user": username, "profile_pic": profile_pic}
    return {"status": "unauthenticated"}

@app.post("/update-username")
async def update_username(new_username: str = Form(...), user_email: str = Depends(get_current_user)):
    if user_email == "guest":
        raise HTTPException(status_code=403, detail="Guests cannot change usernames")
    
    new_username = new_username.strip()
    if not new_username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")
        
    if new_username in usernames_set:
        # Check if it's the same as their current one
        if users_db[user_email]["username"] == new_username:
            return {"status": "success", "username": new_username}
        raise HTTPException(status_code=400, detail="Username already taken")
    
    old_username = users_db[user_email]["username"]
    if old_username in usernames_set:
        usernames_set.remove(old_username)
        
    users_db[user_email]["username"] = new_username
    usernames_set.add(new_username)
    save_users()
    
    return {"status": "success", "username": new_username}

@app.post("/upload-profile-pic")
async def upload_profile_pic(file: UploadFile = File(...), user_email: str = Depends(get_current_user)):
    if user_email == "guest":
        raise HTTPException(status_code=403, detail="Guests cannot have profile pictures")
    
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    ext = os.path.splitext(file.filename)[1]
    filename = f"{user_email.replace('@', '_').replace('.', '_')}{ext}"
    os.makedirs("uploads/profiles", exist_ok=True)
    file_path = os.path.join("uploads", "profiles", filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    profile_url = f"/uploads/profiles/{filename}"
    users_db[user_email]["profile_pic"] = profile_url
    save_users()
    
    # Return with cache buster for immediate UI update
    return {"status": "success", "profile_pic": f"{profile_url}?t={int(datetime.now().timestamp())}"}

@app.post("/remove-profile-pic")
async def remove_profile_pic(user_email: str = Depends(get_current_user)):
    if user_email == "guest":
        return {"status": "success"}
        
    if "profile_pic" in users_db[user_email]:
        del users_db[user_email]["profile_pic"]
        save_users()
        
    return {"status": "success"}


# --- Downloader & History Logic ---
def progress_hook(d):
    global current_progress
    if d['status'] == 'downloading':
        try:
            percent_str = d.get('_percent_str', '0.0%')
            ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
            percent_str = ansi_escape.sub('', percent_str).replace('%', '').strip()
            current_progress['percent'] = float(percent_str)
            current_progress['status'] = 'downloading'
            current_progress['filename'] = os.path.basename(d.get('filename', ''))
            current_progress['message'] = f"Downloading: {current_progress['percent']}%"
        except Exception:
            pass
    elif d['status'] == 'finished':
        current_progress['status'] = 'processing'
        current_progress['percent'] = 100
        current_progress['message'] = "Download complete. Converting to MP3..."

def download_video(url, output_path, user_email, quality="320", audio_format="mp3"):
    global current_progress
    
    ffmpeg_bin = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "MP3_Converter", "ffmpeg")
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'nocheckcertificate': True,
        'outtmpl': os.path.join(output_path, '%(title)s.%(ext)s'),
        'writethumbnails': True,
        'postprocessors': [
            {
                'key': 'FFmpegExtractAudio',
                'preferredcodec': audio_format,
                'preferredquality': quality,
            },
            {
                'key': 'EmbedThumbnail',
            },
            {
                'key': 'FFmpegMetadata',
                'add_metadata': True,
            }
        ],
        'progress_hooks': [progress_hook]
    }
    
    if os.path.exists('cookies.txt'):
        ydl_opts['cookiefile'] = 'cookies.txt'
    
    if os.path.exists(ffmpeg_bin):
        ydl_opts['ffmpeg_location'] = ffmpeg_bin
        
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Extract info to get metadata, and it also downloads because download=True
            info = ydl.extract_info(url, download=True)
            
            title = info.get('title', 'Unknown Title')
            duration_raw = info.get('duration', 0)
            duration = info.get('duration_string') or f"{duration_raw // 60}:{duration_raw % 60:02d}"
            
            # Reconstruct the expected output filename
            filename = ydl.prepare_filename(info)
            filename = os.path.splitext(os.path.basename(filename))[0] + ".mp3"
            
            meta = {
                "id": info.get('id', str(datetime.now().timestamp())),
                "title": title,
                "artist": info.get("artist") or info.get("uploader") or info.get("channel") or "",
                "duration": duration,
                "filename": filename,
                "thumbnail": info.get('thumbnail') or f"https://i.ytimg.com/vi/{info.get('id')}/hqdefault.jpg",
                "date": datetime.now().strftime("%b %d, %Y")
            }
            
            if user_email != "guest":
                if user_email not in history_db:
                    history_db[user_email] = []
                history_db[user_email].insert(0, meta) # Prepend
                save_history()
            
            current_progress['metadata'] = meta
            current_progress['status'] = 'finished'
            current_progress['message'] = "Success! MP3 saved."
    except Exception as e:
        current_progress['status'] = 'error'
        current_progress['message'] = f"Error: {str(e)}"

def tidy_lyrics_text(value):
    return re.sub(r"\s+", " ", html.unescape(str(value or ""))).strip()

def clean_title_text(title):
    title = tidy_lyrics_text(title)
    title = LYRICS_BRACKET_NOISE_RE.sub("", title)
    title = LYRICS_FEATURE_BRACKET_RE.sub("", title)
    title = re.sub(r"\s+\|\s+.*\b(official|video|audio|lyrics?|lyric|visualizer)\b.*$", "", title, flags=re.I)
    title = LYRICS_TRAILING_NOISE_RE.sub("", title)
    title = LYRICS_FEATURE_SUFFIX_RE.sub("", title)
    title = re.sub(r"\s+", " ", title).strip(" -–—|")
    return title

def clean_artist_name(artist):
    artist = tidy_lyrics_text(artist)
    artist = re.sub(r"[\(\[][^\)\]]*(official|topic|channel)[^\)\]]*[\)\]]", "", artist, flags=re.I)
    artist = re.sub(r"\s*[-–—]?\s*topic$", "", artist, flags=re.I)
    artist = re.sub(r"\s*(?:vevo|official)$", "", artist, flags=re.I)
    artist = re.sub(r"\s+(?:lyrics?|records?|recordings?|entertainment|media|channel)$", "", artist, flags=re.I)
    artist = LYRICS_FEATURE_SUFFIX_RE.sub("", artist)
    artist = re.sub(r"\s+", " ", artist).strip(" -–—|")
    return artist

def split_artist_title(title):
    parts = LYRICS_SPLIT_RE.split(tidy_lyrics_text(title), maxsplit=1)
    if len(parts) != 2:
        return None
    left, right = clean_title_text(parts[0]), clean_title_text(parts[1])
    if not left or not right:
        return None
    return left, right

def normalize_lyrics_match(value):
    value = clean_title_text(value).lower()
    value = value.replace("&", " and ")
    value = re.sub(r"['’`]", "", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()

def clean_lyrics_query(title, artist=""):
    title = tidy_lyrics_text(title)
    artist = clean_artist_name(artist)
    split = split_artist_title(title)

    if split:
        left, right = split
        normalized_artist = normalize_lyrics_match(artist)
        normalized_left = normalize_lyrics_match(left)
        normalized_right = normalize_lyrics_match(right)

        if not artist or (normalized_artist and normalized_left and normalized_left in normalized_artist):
            artist, title = left, right
        elif normalized_artist and normalized_right and normalized_right in normalized_artist:
            artist, title = right, left

    return clean_title_text(title), clean_artist_name(artist)

def unique_lyrics_values(values):
    unique = []
    seen = set()
    for value in values:
        value = tidy_lyrics_text(value)
        key = normalize_lyrics_match(value)
        if value and key not in seen:
            unique.append(value)
            seen.add(key)
    return unique

def add_lyrics_search_candidate(candidates, seen, params):
    clean_params = {}
    for key, value in params.items():
        if value in (None, ""):
            continue
        clean_params[key] = str(value)

    if not (clean_params.get("track_name") or clean_params.get("query")):
        return

    signature = tuple(sorted(clean_params.items()))
    if signature in seen or len(candidates) >= LYRICS_MAX_SEARCHES:
        return

    seen.add(signature)
    candidates.append(clean_params)

def build_lyrics_search_candidates(title, artist="", duration=None):
    clean_title, clean_artist = clean_lyrics_query(title, artist)
    raw_title = tidy_lyrics_text(title)
    raw_artist = clean_artist_name(artist)
    pairs = []

    def add_pair(track_name, artist_name=""):
        track_name = clean_title_text(track_name)
        artist_name = clean_artist_name(artist_name)
        if track_name and (track_name, artist_name) not in pairs:
            pairs.append((track_name, artist_name))

    split = split_artist_title(raw_title)
    if split:
        left, right = split
        add_pair(right, left)
        add_pair(left, right)
    add_pair(clean_title, clean_artist)
    if raw_artist:
        add_pair(clean_title, raw_artist)

    candidates = []
    seen = set()
    try:
        duration_value = int(float(duration)) if duration else None
    except (TypeError, ValueError):
        duration_value = None

    for track_name, artist_name in pairs:
        title_variants = unique_lyrics_values([
            track_name,
            LYRICS_FEATURE_SUFFIX_RE.sub("", track_name),
            LYRICS_FEATURE_BRACKET_RE.sub("", track_name),
        ])
        artist_variants = unique_lyrics_values([
            artist_name,
            LYRICS_FEATURE_SUFFIX_RE.sub("", artist_name),
        ]) or [""]

        for title_variant in title_variants:
            for artist_variant in artist_variants:
                if artist_variant:
                    add_lyrics_search_candidate(candidates, seen, {
                        "track_name": title_variant,
                        "artist_name": artist_variant,
                        "duration": duration_value,
                    })
                    add_lyrics_search_candidate(candidates, seen, {
                        "track_name": title_variant,
                        "artist_name": artist_variant,
                    })
                    add_lyrics_search_candidate(candidates, seen, {
                        "query": f"{artist_variant} {title_variant}",
                    })

                add_lyrics_search_candidate(candidates, seen, {
                    "track_name": title_variant,
                    "duration": duration_value,
                })
                add_lyrics_search_candidate(candidates, seen, {
                    "track_name": title_variant,
                })

    return candidates

def build_lyrics_score_targets(title, artist=""):
    clean_title, clean_artist = clean_lyrics_query(title, artist)
    targets = []

    def add_target(track_name, artist_name=""):
        track_name = clean_title_text(track_name)
        artist_name = clean_artist_name(artist_name)
        signature = (normalize_lyrics_match(track_name), normalize_lyrics_match(artist_name))
        if track_name and signature not in [(normalize_lyrics_match(t), normalize_lyrics_match(a)) for t, a in targets]:
            targets.append((track_name, artist_name))

    add_target(clean_title, clean_artist)
    split = split_artist_title(title)
    if split:
        left, right = split
        add_target(right, left)
        add_target(left, right)
    return targets

def parse_synced_lyrics(lrc_text):
    lines = []
    for raw_line in (lrc_text or "").splitlines():
        matches = list(LRC_TIMESTAMP_RE.finditer(raw_line))
        text = LRC_TIMESTAMP_RE.sub("", raw_line).strip()
        if not matches or not text:
            continue
        for match in matches:
            minutes = int(match.group(1))
            seconds = int(match.group(2))
            fraction = match.group(3) or "0"
            time_value = (minutes * 60) + seconds + (int(fraction.ljust(3, "0")[:3]) / 1000)
            lines.append({"time": round(time_value, 3), "text": text})
    return sorted(lines, key=lambda item: item["time"])

def parse_plain_lyrics(plain_text):
    return [
        {"time": None, "text": line.strip()}
        for line in (plain_text or "").splitlines()
        if line.strip()
    ]

def lyrics_result_identity(item):
    if item.get("id") is not None:
        return f"id:{item.get('id')}"
    return "|".join([
        normalize_lyrics_match(item.get("trackName") or item.get("name") or ""),
        normalize_lyrics_match(item.get("artistName") or ""),
        str(item.get("duration") or ""),
    ])

def lyric_lines_for_result(item):
    synced_lines = parse_synced_lyrics(item.get("syncedLyrics"))
    if synced_lines:
        return True, synced_lines
    return False, parse_plain_lyrics(item.get("plainLyrics"))

def token_overlap_score(left, right):
    left_tokens = set(normalize_lyrics_match(left).split())
    right_tokens = set(normalize_lyrics_match(right).split())
    if not left_tokens or not right_tokens:
        return 0
    return len(left_tokens & right_tokens) / max(len(left_tokens), len(right_tokens))

def score_lyrics_result(item, target_title, target_artist="", duration=None):
    result_title = item.get("trackName") or item.get("name") or ""
    result_artist = item.get("artistName") or ""
    title_norm = normalize_lyrics_match(target_title)
    result_title_norm = normalize_lyrics_match(result_title)
    artist_norm = normalize_lyrics_match(target_artist)
    result_artist_norm = normalize_lyrics_match(result_artist)
    score = 0

    if title_norm and result_title_norm:
        if title_norm == result_title_norm:
            score += 75
        elif title_norm in result_title_norm or result_title_norm in title_norm:
            score += 52
        else:
            score += token_overlap_score(target_title, result_title) * 45

    if artist_norm and result_artist_norm:
        if artist_norm == result_artist_norm:
            score += 30
        elif artist_norm in result_artist_norm or result_artist_norm in artist_norm:
            score += 18
        else:
            score += token_overlap_score(target_artist, result_artist) * 20

    if item.get("syncedLyrics"):
        score += 8
    elif item.get("plainLyrics"):
        score += 5

    try:
        result_duration = int(float(item.get("duration") or 0))
        target_duration = int(float(duration or 0))
    except (TypeError, ValueError):
        result_duration = 0
        target_duration = 0

    if result_duration and target_duration:
        difference = abs(result_duration - target_duration)
        if difference <= 2:
            score += 15
        elif difference <= 6:
            score += 10
        elif difference <= 12:
            score += 5
        elif difference > 35:
            score -= 8

    version_terms = ("live", "remix", "karaoke", "instrumental", "sped", "slowed", "cover")
    target_version_text = normalize_lyrics_match(target_title)
    result_version_text = normalize_lyrics_match(result_title)
    for term in version_terms:
        if term in result_version_text and term not in target_version_text:
            score -= 10

    return score

def pick_lyrics_result(results, target_title, target_artist="", duration=None, require_lyrics=True, score_targets=None):
    score_targets = score_targets or [(target_title, target_artist)]
    best = None
    best_score = -1
    for item in results:
        if not isinstance(item, dict):
            continue
        if require_lyrics:
            _, lines = lyric_lines_for_result(item)
            if not lines:
                continue
        score = max(score_lyrics_result(item, title, artist, duration) for title, artist in score_targets)
        if score > best_score:
            best = item
            best_score = score
    return best, best_score

def request_lrclib_search(params):
    url = "https://lrclib.net/api/search?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "MusicWorld/1.0"})
    with urllib.request.urlopen(request, timeout=LYRICS_SEARCH_TIMEOUT, context=LRCLIB_SSL_CONTEXT) as response:
        results = json.loads(response.read().decode("utf-8"))
    return results if isinstance(results, list) else []

def build_lyrics_payload_from_result(best, clean_title, clean_artist):
    synced, lines = lyric_lines_for_result(best)
    return {
        "status": "ok" if lines else "missing",
        "synced": synced,
        "instrumental": bool(best.get("instrumental")),
        "track": best.get("trackName") or best.get("name") or clean_title,
        "artist": best.get("artistName") or clean_artist,
        "source": "LRCLIB",
        "lines": lines[:LYRICS_MAX_LINES],
        "message": "Lyrics loaded." if lines else "Lyrics not found for this song."
    }

def fetch_lyrics_payload(title, artist="", duration=None):
    clean_title, clean_artist = clean_lyrics_query(title, artist)
    if not clean_title:
        return {"status": "missing", "lines": [], "message": "No title to search."}

    cache_key = f"{clean_title.lower()}|{clean_artist.lower()}|{duration or ''}"
    if cache_key in LYRICS_CACHE:
        return LYRICS_CACHE[cache_key]

    candidates = build_lyrics_search_candidates(title, artist, duration)
    score_targets = build_lyrics_score_targets(title, artist)
    results = []
    seen_results = set()
    last_error = None

    for params in candidates:
        try:
            search_results = request_lrclib_search(params)
        except Exception as exc:
            last_error = exc
            continue

        for item in search_results:
            identity = lyrics_result_identity(item) if isinstance(item, dict) else None
            if identity and identity not in seen_results:
                seen_results.add(identity)
                results.append(item)

        best, score = pick_lyrics_result(results, clean_title, clean_artist, duration, score_targets=score_targets)
        if best and score >= 95 and best.get("syncedLyrics"):
            break

    if not results and last_error:
        return {"status": "error", "lines": [], "message": f"Lyrics lookup failed: {last_error}"}

    if not results:
        payload = {"status": "missing", "lines": [], "message": "Lyrics not found for this song."}
        LYRICS_CACHE[cache_key] = payload
        return payload

    best, best_score = pick_lyrics_result(results, clean_title, clean_artist, duration, score_targets=score_targets)
    if not best:
        instrumental, instrumental_score = pick_lyrics_result(results, clean_title, clean_artist, duration, require_lyrics=False, score_targets=score_targets)
        if instrumental and instrumental.get("instrumental") and instrumental_score >= 45:
            payload = {
                "status": "instrumental",
                "synced": False,
                "instrumental": True,
                "track": instrumental.get("trackName") or clean_title,
                "artist": instrumental.get("artistName") or clean_artist,
                "source": "LRCLIB",
                "lines": [],
                "message": "This track is marked as instrumental."
            }
        else:
            payload = {"status": "missing", "lines": [], "message": "Lyrics not found for this song."}
        LYRICS_CACHE[cache_key] = payload
        return payload

    if best_score < 35:
        payload = {"status": "missing", "lines": [], "message": "Lyrics not found for this song."}
        LYRICS_CACHE[cache_key] = payload
        return payload

    payload = build_lyrics_payload_from_result(best, clean_title, clean_artist)
    LYRICS_CACHE[cache_key] = payload
    return payload

# --- Routes ---
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/convert")
async def convert(
    url: str = Form(...), 
    quality: str = Form("320"), 
    audio_format: str = Form("mp3"),
    user_email: str = Depends(get_current_user)
):
    global current_progress
    current_progress = {"percent": 0, "status": "starting", "filename": "", "message": "Preparing download...", "metadata": None}
    
    downloads_path = os.path.join(os.path.expanduser("~"), "Downloads")
    
    asyncio.create_task(asyncio.to_thread(download_video, url, downloads_path, user_email, quality, audio_format))
    return {"status": "started", "message": "Download task started in the background."}

@app.get("/progress")
async def progress(user_email: str = Depends(get_current_user)):
    async def event_generator():
        while True:
            yield f"data: {json.dumps(current_progress)}\n\n"
            if current_progress['status'] in ['finished', 'error']:
                yield f"data: {json.dumps(current_progress)}\n\n"
                break
            await asyncio.sleep(0.5)
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/history")
async def get_history(user_email: str = Depends(get_current_user)):
    if user_email == "guest":
        return []
    return history_db.get(user_email, [])

@app.post("/clear-history")
async def clear_history(user_email: str = Depends(get_current_user)):
    if user_email != "guest":
        if user_email in history_db:
            history_db[user_email] = []
            save_history()
    return {"status": "success", "message": "History cleared"}

@app.get("/search")
async def search_youtube(q: str):
    print(f"🔍 SEARCH REQUEST: {q}")
    if not q or len(q.strip()) < 1:
        return []
    
    # Ultra-simple opts for maximum compatibility
    ydl_opts = {
        'format': 'bestaudio/best',
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        'extract_flat': True,
        'skip_download': True,
    }
    
    if os.path.exists('cookies.txt'):
        ydl_opts['cookiefile'] = 'cookies.txt'
    
    try:
        def _fetch():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                search_query = f"ytsearch10:{q}"
                print(f"📡 Calling yt-dlp with: {search_query}")
                return ydl.extract_info(search_query, download=False)
        
        results = await asyncio.to_thread(_fetch)
        if not results or 'entries' not in results:
            print("❌ No results found in yt-dlp response")
            return []
            
        entries = results.get('entries', [])
        print(f"✅ Found {len(entries)} entries")
        
        output = []
        for entry in entries:
            if not entry: continue
            v_id = entry.get("id")
            if not v_id: continue
            
            output.append({
                "id": v_id,
                "title": entry.get("title") or "Unknown Title",
                "thumbnail": entry.get("thumbnail") or f"https://i.ytimg.com/vi/{v_id}/hqdefault.jpg",
                "duration": entry.get("duration_string") or "??:??",
                "url": f"https://www.youtube.com/watch?v={v_id}"
            })
        return output
    except Exception as e:
        print(f"🚨 SEARCH ERROR: {e}")
        return []

@app.get("/lyrics")
async def get_lyrics(title: str, artist: str = "", duration: int = 0, user_email: str = Depends(get_current_user)):
    if not title.strip():
        return {"status": "missing", "lines": [], "message": "No title to search."}
    return await asyncio.to_thread(fetch_lyrics_payload, title, artist, duration or None)

@app.get("/stream/{filename}")
async def stream_audio(filename: str, user_email: str = Depends(get_current_user)):
    downloads_path = os.path.join(os.path.expanduser("~"), "Downloads")
    file_path = os.path.join(downloads_path, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, media_type="audio/mpeg", filename=filename)

if __name__ == "__main__":
    # pyrefly: ignore [missing-import]
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
