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
        'progress_hooks': [progress_hook],
        'extractor_args': {
            'youtube': {
                'player_client': ['android']
            }
        }
    }
    
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
