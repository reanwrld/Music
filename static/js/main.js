/**
 * Music Premium - Core Application Logic
 * Optimized for performance and clean UI interactions.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // --- Configuration & State ---
    let currentUserRole = null;
    let currentPlaylist = [];
    let currentTrackIndex = -1;
    let progressFrame = null;
    let lastProgressRender = 0;
    let suggestionRenderToken = 0;
    let queuePointerStart = null;
    let currentLyrics = [];
    let currentLyricIndex = -1;
    let lyricsRequestToken = 0;
    let lyricsLineNodes = [];
    let lyricsAutoScrollFrame = null;
    let lyricsUserScrollUntil = 0;
    const resolvedSuggestionCache = new Map();
    const lyricsCache = new Map();

    // --- DOM Selection ---
    const elements = {
        app: document.getElementById('appContainer'),
        login: document.getElementById('loginOverlay'),
        sidebar: document.getElementById('sidebar'),
        overlay: document.getElementById('sidebarOverlay'),
        views: {
            converter: document.getElementById('converterView'),
            history: document.getElementById('historyView'),
            search: document.getElementById('searchView')
        },
        nav: {
            convert: document.getElementById('navConvert'),
            history: document.getElementById('navHistory'),
            toggle: document.getElementById('sidebarToggle'),
            logout: document.getElementById('sidebarLogout'),
            settings: document.getElementById('sidebarSettings'),
            theme: document.getElementById('themeToggle')
        },
        auth: {
            tabLogin: document.getElementById('tabLogin'),
            tabSignup: document.getElementById('tabSignup'),
            loginForm: document.getElementById('loginForm'),
            signupForm: document.getElementById('signupForm'),
            loginBtn: document.getElementById('loginSubmitBtn'),
            signupBtn: document.getElementById('signupSubmitBtn'),
            guestBtn: document.getElementById('guestBtn')
        },
        player: {
            container: document.getElementById('audioPlayer'),
            audio: document.getElementById('htmlAudio'),
            playBtn: document.getElementById('playerPlayBtn'),
            playIcon: document.getElementById('playerPlayIcon'),
            seekbar: document.getElementById('playerSeekbar'),
            volume: document.getElementById('playerVolume'),
            title: document.getElementById('playerTitle'),
            artist: document.getElementById('playerArtist'),
            queuePosition: document.getElementById('playerQueuePosition'),
            current: document.getElementById('playerCurrentTime'),
            total: document.getElementById('playerTotalTime')
        },
        converter: {
            form: document.getElementById('convertForm'),
            input: document.getElementById('urlInput'),
            btn: document.getElementById('submitBtn'),
            btnText: document.getElementById('btnText'),
            progress: document.getElementById('progressContainer'),
            fill: document.getElementById('progressFill'),
            status: document.getElementById('statusText'),
            percent: document.getElementById('percentText'),
            suggestions: document.getElementById('suggestionList'),
            suggestionHint: document.getElementById('suggestionHint'),
            refreshSuggestions: document.getElementById('refreshSuggestionsBtn')
        },
        settings: {
            modal: document.getElementById('settingsModal'),
            close: document.getElementById('closeSettingsBtn'),
            save: document.getElementById('saveSettingsBtn'),
            autoplay: document.getElementById('autoPlaySetting')
        },
        dashboard: {
            guestBanner: document.getElementById('guestBanner'),
            libraryList: document.getElementById('dashboardLibraryList')
        },
        welcome: {
            overlay: document.getElementById('welcomeOverlay'),
            greeting: document.getElementById('welcomeGreeting')
        }
    };

    // Full-screen Player Elements
    const nowPlayingOverlay = document.getElementById('nowPlayingOverlay');
    const closeNowPlaying = document.getElementById('closeNowPlaying');
    const nowPlayingMode = document.getElementById('nowPlayingMode');
    const nowPlayingTitle = document.getElementById('nowPlayingTitle');
    const largePlayBtn = document.getElementById('largePlayBtn');
    const largePlayIcon = document.getElementById('largePlayIcon');
    const largeSeekbar = document.getElementById('largeSeekbar');
    const largeVolume = document.getElementById('largeVolume');
    const largeTrackTitle = document.getElementById('largeTrackTitle');
    const largeArtistName = document.getElementById('largeArtistName');
    const largeCurrentTime = document.getElementById('largeCurrentTime');
    const largeTotalTime = document.getElementById('largeTotalTime');
    const largeQueueMeta = document.getElementById('largeQueueMeta');
    const largeLyricsBtn = document.getElementById('largeLyricsBtn');
    const largeLyricsIcon = document.getElementById('largeLyricsIcon');
    const largeLyricsPanel = document.getElementById('largeLyricsPanel');
    const largeQueueBtn = document.getElementById('largeQueueBtn');
    const largeQueueIcon = document.getElementById('largeQueueIcon');
    const largeQueuePanel = document.getElementById('largeQueuePanel');
    const nowPlayingBg = document.getElementById('nowPlayingBg');
    const largeArtwork = document.getElementById('largeArtwork');

    // --- Helpers ---
    const formatTime = (s) => isNaN(s) ? "0:00" : `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2, '0')}`;
    const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
    const getThumb = (item) => item.thumbnail || `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`;
    const getLargeThumb = (item) => getThumb(item).replace(/\/(default|mqdefault|hqdefault|sddefault)\.(jpg|webp)(\?.*)?$/i, '/maxresdefault.$2$3');
    const getTrackSubtitle = (track) => `${track.duration || '0:00'} • YouTube`;
    const parseDurationSeconds = (value = '') => {
        const parts = String(value).split(':').map(part => Number(part));
        if (!parts.length || parts.some(Number.isNaN)) return 0;
        return parts.reduce((total, part) => (total * 60) + part, 0);
    };
    const getLyricsQuery = (track = {}) => {
        let title = track.title || '';
        let artist = track.artist || '';
        const split = title.match(/^(.+?)\s[-–—]\s(.+)$/);
        if (!artist && split) {
            artist = split[1].trim();
            title = split[2].trim();
        }
        title = title.replace(/[\(\[][^\)\]]*(official|video|audio|lyrics|lyric|visualizer|clean|explicit|sped up|slowed|remix)[^\)\]]*[\)\]]/gi, '').replace(/\s+/g, ' ').trim();
        return { title, artist, duration: parseDurationSeconds(track.duration) };
    };
    const isAutoplayEnabled = () => localStorage.getItem('autoPlay') !== 'false';
    const isVisible = (el) => Boolean(el && el.getClientRects().length);
    const getCurrentTrack = () => currentTrackIndex >= 0 ? currentPlaylist[currentTrackIndex] : null;
    const setPlaybackIcon = (isPlaying) => {
        if (elements.player.playIcon) elements.player.playIcon.setAttribute('name', isPlaying ? 'pause-sharp' : 'play-sharp');
        if (largePlayIcon) largePlayIcon.setAttribute('name', isPlaying ? 'pause-sharp' : 'play-sharp');
    };
    const getNowPlayingMode = () => {
        if (nowPlayingOverlay?.classList.contains('is-queue-open')) return 'Up Next';
        if (nowPlayingOverlay?.classList.contains('is-lyrics-open')) return 'Lyrics';
        return 'Now Playing';
    };
    const setNowPlayingHeader = (mode = getNowPlayingMode()) => {
        const track = getCurrentTrack();
        const title = track?.title || 'Not Playing';
        if (nowPlayingMode) nowPlayingMode.textContent = mode || 'Now Playing';
        if (nowPlayingTitle) {
            nowPlayingTitle.textContent = title;
            nowPlayingTitle.title = title;
        }
    };
    const suggestionPool = [
        { title: 'Snooze', artist: 'SZA', tag: 'R&B', tags: ['rnb', 'chill', 'soul', 'pop'] },
        { title: 'Die For You', artist: 'The Weeknd', tag: 'R&B', tags: ['rnb', 'pop', 'night'] },
        { title: 'Pink + White', artist: 'Frank Ocean', tag: 'Chill', tags: ['rnb', 'chill', 'soul'] },
        { title: 'Location', artist: 'Khalid', tag: 'Chill', tags: ['rnb', 'chill', 'pop'] },
        { title: 'Passionfruit', artist: 'Drake', tag: 'Vibe', tags: ['hiphop', 'rnb', 'chill'] },
        { title: 'Too Many Nights', artist: 'Metro Boomin', tag: 'Rap', tags: ['hiphop', 'trap', 'night'] },
        { title: 'LOVE.', artist: 'Kendrick Lamar', tag: 'Rap', tags: ['hiphop', 'rnb', 'chill'] },
        { title: 'Telekinesis', artist: 'Travis Scott', tag: 'Rap', tags: ['hiphop', 'trap', 'night'] },
        { title: 'Redbone', artist: 'Childish Gambino', tag: 'Soul', tags: ['soul', 'funk', 'chill'] },
        { title: 'Good Days', artist: 'SZA', tag: 'Chill', tags: ['rnb', 'soul', 'chill'] },
        { title: 'Blinding Lights', artist: 'The Weeknd', tag: 'Pop', tags: ['pop', 'dance', 'night'] },
        { title: 'Levitating', artist: 'Dua Lipa', tag: 'Pop', tags: ['pop', 'dance'] },
        { title: 'As It Was', artist: 'Harry Styles', tag: 'Pop', tags: ['pop', 'indie'] },
        { title: 'Bad Habit', artist: 'Steve Lacy', tag: 'Indie', tags: ['indie', 'rnb', 'chill'] },
        { title: 'Heat Waves', artist: 'Glass Animals', tag: 'Indie', tags: ['indie', 'pop', 'chill'] },
        { title: 'Electric Feel', artist: 'MGMT', tag: 'Indie', tags: ['indie', 'dance'] },
        { title: 'Nights', artist: 'Frank Ocean', tag: 'Late Night', tags: ['rnb', 'chill', 'night'] },
        { title: 'One Dance', artist: 'Drake', tag: 'Afro', tags: ['afrobeats', 'dance', 'hiphop'] },
        { title: 'Essence', artist: 'Wizkid', tag: 'Afro', tags: ['afrobeats', 'rnb', 'chill'] },
        { title: 'Last Last', artist: 'Burna Boy', tag: 'Afro', tags: ['afrobeats', 'dance'] },
        { title: 'Water', artist: 'Tyla', tag: 'Afro Pop', tags: ['afrobeats', 'pop', 'dance'] },
        { title: 'Get Lucky', artist: 'Daft Punk', tag: 'Dance', tags: ['dance', 'funk', 'pop'] },
        { title: 'Sweet Disposition', artist: 'The Temper Trap', tag: 'Indie', tags: ['indie', 'chill'] },
        { title: 'Sunflower', artist: 'Post Malone', tag: 'Easy', tags: ['pop', 'hiphop', 'chill'] }
    ];
    const preferenceRules = [
        { tag: 'hiphop', terms: ['drake', 'travis', 'kendrick', 'future', 'metro', 'carti', 'savage', 'lil', 'rap', 'gunna', 'thug'] },
        { tag: 'rnb', terms: ['sza', 'weeknd', 'frank ocean', 'khalid', 'brent', 'bryson', 'r&b', 'rnb', 'summer walker'] },
        { tag: 'afrobeats', terms: ['wizkid', 'burna', 'tyla', 'rema', 'tem', 'afro', 'davido'] },
        { tag: 'dance', terms: ['dance', 'club', 'dua lipa', 'daft punk', 'house', 'edm', 'party'] },
        { tag: 'indie', terms: ['indie', 'steve lacy', 'glass animals', 'mgmt', 'tame impala', 'arctic'] },
        { tag: 'chill', terms: ['chill', 'slow', 'lofi', 'night', 'sad', 'love', 'vibe', 'acoustic'] },
        { tag: 'pop', terms: ['pop', 'harry styles', 'taylor', 'ariana', 'weeknd', 'post malone'] }
    ];

    function showWelcome(userName = 'there') {
        if (!elements.welcome.overlay) return;
        const cleanName = String(userName || 'there').trim() || 'there';
        if (elements.welcome.greeting) {
            elements.welcome.greeting.textContent = cleanName.toLowerCase() === 'guest'
                ? 'Welcome, Guest'
                : `Welcome, ${cleanName}`;
        }

        elements.welcome.overlay.classList.remove('hidden', 'is-leaving');
        elements.welcome.overlay.classList.add('is-visible');
        elements.welcome.overlay.setAttribute('aria-hidden', 'false');

        window.clearTimeout(showWelcome.hideTimer);
        window.clearTimeout(showWelcome.removeTimer);
        showWelcome.hideTimer = window.setTimeout(() => {
            elements.welcome.overlay.classList.add('is-leaving');
            elements.welcome.overlay.classList.remove('is-visible');
            showWelcome.removeTimer = window.setTimeout(() => {
                elements.welcome.overlay.classList.add('hidden');
                elements.welcome.overlay.classList.remove('is-leaving');
                elements.welcome.overlay.setAttribute('aria-hidden', 'true');
            }, 420);
        }, 1900);
    }

    // --- UI Logic ---
    const setSidebarOpen = (isOpen) => {
        elements.sidebar.classList.toggle('active', isOpen);
        elements.overlay.classList.toggle('active', isOpen);
        document.body.classList.toggle('sidebar-open', isOpen);

        if (elements.nav.toggle) {
            elements.nav.toggle.classList.toggle('is-open', isOpen);
            elements.nav.toggle.setAttribute('aria-expanded', String(isOpen));
            elements.nav.toggle.setAttribute('aria-label', isOpen ? 'Close sidebar' : 'Open sidebar');
            const icon = elements.nav.toggle.querySelector('ion-icon');
            if (icon) icon.setAttribute('name', isOpen ? 'close-outline' : 'menu-outline');
        }
    };

    const toggleSidebar = () => {
        setSidebarOpen(!elements.sidebar.classList.contains('active'));
    };

    window.switchPage = (pageKey) => {
        if (!elements.views[pageKey]) return;
        Object.values(elements.views).forEach(v => v.classList.add('hidden'));
        elements.views[pageKey].classList.remove('hidden');
        
        // Update Desktop Sidebar
        if (elements.nav.convert) elements.nav.convert.classList.toggle('active', pageKey === 'converter');
        if (elements.nav.history) elements.nav.history.classList.toggle('active', pageKey === 'history');
        
        // Update Mobile Bottom Nav
        document.querySelectorAll('.mobile-nav-item').forEach(item => {
            const label = item.querySelector('span')?.textContent.toLowerCase();
            const isTarget = (pageKey === 'converter' && label === 'listen now') || 
                             (pageKey === 'history' && label === 'library') ||
                             (pageKey === 'search' && label === 'search');
            item.classList.toggle('active', isTarget);
        });

        if (pageKey === 'history') loadHistory();
    };

    window.showToast = (msg) => {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = msg;
        toast.style.transform = 'translateX(-50%) translateY(0)';
        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(-150px)';
        }, 3000);
    };

    const searchBarInput = document.getElementById('searchBarInput');
    if (searchBarInput) {
        searchBarInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = searchBarInput.value.trim();
                if (query) {
                    switchPage('converter');
                    elements.converter.input.value = query;
                    if (typeof elements.converter.form.requestSubmit === 'function') elements.converter.form.requestSubmit();
                    else elements.converter.form.dispatchEvent(new Event('submit', { cancelable: true }));
                }
            }
        });
    }

    // --- Theme Control ---
    const initTheme = () => {
        const theme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        if (theme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            const icon = elements.nav.theme?.querySelector('ion-icon');
            if (icon) icon.setAttribute('name', 'sunny-outline');
        }
    };

    if (elements.nav.theme) {
        elements.nav.theme.addEventListener('click', () => {
            const isDark = document.body.hasAttribute('data-theme');
            const icon = elements.nav.theme.querySelector('ion-icon');
            
            if (isDark) {
                document.body.removeAttribute('data-theme');
                if (icon) icon.setAttribute('name', 'moon-outline');
                localStorage.setItem('theme', 'light');
            } else {
                document.body.setAttribute('data-theme', 'dark');
                if (icon) icon.setAttribute('name', 'sunny-outline');
                localStorage.setItem('theme', 'dark');
            }
            
            // Add a small pop animation
            elements.nav.theme.style.transform = 'scale(0.8)';
            setTimeout(() => elements.nav.theme.style.transform = 'scale(1)', 100);
        });
    }

    // --- Authentication ---
    async function checkAuth({ showWelcomeMessage = false } = {}) {
        try {
            const res = await fetch('/check-auth');
            const data = await res.json();
            if (data.status === 'authenticated') {
                currentUserRole = data.role;
                document.getElementById('sidebarUsername').textContent = data.user;
                document.getElementById('sidebarUserRole').textContent = data.role === 'guest' ? 'Guest Access' : 'Premium Member';
                if (elements.dashboard.guestBanner) elements.dashboard.guestBanner.classList.toggle('hidden', data.role !== 'guest');
                elements.login.classList.add('hidden');
                elements.app.classList.remove('hidden');
                loadHistory();
                if (showWelcomeMessage) showWelcome(data.user);
            } else {
                currentUserRole = null;
                elements.login.classList.remove('hidden');
                elements.app.classList.add('hidden');
            }
        } catch (e) {
            currentUserRole = null;
            elements.login.classList.remove('hidden');
        }
    }

    const tabLogin = document.getElementById('tabLogin');
    const tabSignup = document.getElementById('tabSignup');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const guestBtn = document.getElementById('guestBtn');
    const loginError = document.getElementById('loginError');

    function showError(msg) {
        if (loginError) { loginError.textContent = msg; loginError.style.color = '#ff3b30'; loginError.style.display = 'block'; }
    }
    function hideError() {
        if (loginError) { loginError.textContent = ''; loginError.style.display = 'none'; }
    }

    function setActiveTab(tab) {
        hideError();
        if (tab === 'login') {
            if (loginForm) loginForm.style.display = 'flex';
            if (signupForm) signupForm.style.display = 'none';
            if (tabLogin) {
                tabLogin.style.background = 'white';
                tabLogin.style.color = '#1d1d1f';
                tabLogin.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
            }
            if (tabSignup) {
                tabSignup.style.background = 'transparent';
                tabSignup.style.color = '#86868b';
                tabSignup.style.boxShadow = 'none';
            }
        } else {
            if (signupForm) signupForm.style.display = 'flex';
            if (loginForm) loginForm.style.display = 'none';
            if (tabSignup) {
                tabSignup.style.background = 'white';
                tabSignup.style.color = '#1d1d1f';
                tabSignup.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
            }
            if (tabLogin) {
                tabLogin.style.background = 'transparent';
                tabLogin.style.color = '#86868b';
                tabLogin.style.boxShadow = 'none';
            }
        }
    }

    if (tabLogin) tabLogin.addEventListener('click', () => setActiveTab('login'));
    if (tabSignup) tabSignup.addEventListener('click', () => setActiveTab('signup'));

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            if (!email || !password) { showError('Please fill in all fields.'); return; }
            const formData = new FormData();
            formData.append('email', email);
            formData.append('password', password);
            const submitBtn = loginForm.querySelector('button[type=submit]');
            if (submitBtn) { submitBtn.textContent = 'Signing in...'; submitBtn.disabled = true; }
            try {
                const res = await fetch('/login', { method: 'POST', body: formData });
                if (res.ok) {
                    checkAuth({ showWelcomeMessage: true });
                } else {
                    showError('Invalid email or password. Please try again.');
                    if (submitBtn) { submitBtn.textContent = 'Continue'; submitBtn.disabled = false; }
                }
            } catch (err) {
                showError('Connection error. Please try again.');
                if (submitBtn) { submitBtn.textContent = 'Continue'; submitBtn.disabled = false; }
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();
            const username = document.getElementById('signupUsername').value.trim();
            const email = document.getElementById('signupEmail').value.trim();
            const password = document.getElementById('signupPassword').value;
            if (!username || !email || !password) { showError('Please fill in all fields.'); return; }
            if (password.length < 6) { showError('Password must be at least 6 characters.'); return; }
            const formData = new FormData();
            formData.append('username', username);
            formData.append('email', email);
            formData.append('password', password);
            const submitBtn = signupForm.querySelector('button[type=submit]');
            if (submitBtn) { submitBtn.textContent = 'Creating account...'; submitBtn.disabled = true; }
            try {
                const res = await fetch('/signup', { method: 'POST', body: formData });
                if (res.ok) {
                    checkAuth({ showWelcomeMessage: true });
                } else {
                    const body = await res.json().catch(() => ({}));
                    showError(body.detail || 'Signup failed. Email may already be in use.');
                    if (submitBtn) { submitBtn.textContent = 'Create Account'; submitBtn.disabled = false; }
                }
            } catch (err) {
                showError('Connection error. Please try again.');
                if (submitBtn) { submitBtn.textContent = 'Create Account'; submitBtn.disabled = false; }
            }
        });
    }

    if (guestBtn) {
        guestBtn.addEventListener('click', async () => {
            guestBtn.textContent = 'Loading...';
            try {
                const res = await fetch('/guest-login', { method: 'POST' });
                if (res.ok) checkAuth({ showWelcomeMessage: true });
                else { guestBtn.textContent = 'Continue as Guest →'; showError('Guest login failed. Try again.'); }
            } catch (err) {
                guestBtn.textContent = 'Continue as Guest →';
                showError('Connection error. Please try again.');
            }
        });
    }

    if (elements.nav.logout) {
        elements.nav.logout.addEventListener('click', async () => {
            await fetch('/logout', { method: 'POST' });
            location.reload();
        });
    }

    // --- History & Rendering ---
    async function loadHistory() {
        let history = [];
        if (currentUserRole === 'guest') {
            history = JSON.parse(localStorage.getItem('guestHistory') || '[]');
        } else {
            try {
                const res = await fetch('/history');
                history = await res.json();
            } catch (e) {}
        }
        currentPlaylist = history;
        if (history.length === 0) {
            resetPlayerDisplay();
        } else if (currentTrackIndex >= history.length) {
            currentTrackIndex = history.length - 1;
            syncLargePlayer(currentPlaylist[currentTrackIndex]);
        } else {
            updateQueuePosition();
        }
        renderDashboard(history);
        renderHistory(history);
        renderLargeQueue();
    }

    function renderDashboard(history) {
        renderSuggestions(history);
        renderRecentCarousel(history);
        renderDashboardLibrary(history);
    }

    function inferPreferenceTags(history) {
        const text = history.map(item => `${item.title || ''} ${item.artist || ''}`).join(' ').toLowerCase();
        const scores = new Map();

        preferenceRules.forEach(rule => {
            const hits = rule.terms.filter(term => text.includes(term)).length;
            if (hits > 0) scores.set(rule.tag, hits);
        });

        if (scores.size === 0) return ['pop', 'chill', 'rnb'];
        return [...scores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([tag]) => tag);
    }

    function pickSuggestions(history = []) {
        const preferenceTags = inferPreferenceTags(history);
        const historyText = history.map(item => item.title || '').join(' ').toLowerCase();

        const scored = suggestionPool
            .map(item => {
                const alreadyAdded = historyText.includes(item.title.toLowerCase());
                const matchScore = item.tags.filter(tag => preferenceTags.includes(tag)).length;
                return {
                    ...item,
                    alreadyAdded,
                    score: 1 + (matchScore * 4) + Math.random()
                };
            })
            .sort((a, b) => b.score - a.score);

        const picks = scored.filter(item => !item.alreadyAdded).slice(0, 4);
        if (picks.length < 4) {
            picks.push(...scored.filter(item => !picks.some(pick => pick.title === item.title)).slice(0, 4 - picks.length));
        }
        return picks;
    }

    function renderSuggestions(history = currentPlaylist) {
        const list = elements.converter.suggestions;
        if (!list) return;

        const renderToken = ++suggestionRenderToken;
        const picks = pickSuggestions(history);
        if (elements.converter.suggestionHint) {
            elements.converter.suggestionHint.textContent = history.length ? 'Based on your library' : 'Fresh picks to start';
        }

        list.innerHTML = picks.map((item, index) => {
            const query = `${item.title} ${item.artist}`;
            const cached = resolvedSuggestionCache.get(query);
            return `
            <button class="suggestion-card${cached ? ' is-resolved' : ''}" type="button" data-suggestion-index="${index}" data-query="${escapeHtml(query)}"${cached?.url ? ` data-url="${escapeHtml(cached.url)}"` : ''} aria-label="Add ${escapeHtml(item.title)} by ${escapeHtml(item.artist)}">
                <span class="suggestion-thumb">
                    ${cached?.thumbnail ? `<img src="${escapeHtml(cached.thumbnail)}" alt="">` : `
                    <ion-icon name="musical-note"></ion-icon>
                    `}
                </span>
                <span class="suggestion-copy">
                    <strong>${escapeHtml(item.title)}</strong>
                    <small>${escapeHtml(item.artist)}</small>
                </span>
                <span class="suggestion-meta">
                    <span class="suggestion-tag">${escapeHtml(item.tag)}</span>
                    <span class="suggestion-download"><ion-icon name="arrow-down-outline"></ion-icon> Add</span>
                </span>
            </button>
            `;
        }).join('');

        hydrateSuggestionCards(picks, renderToken);
    }

    async function resolveSuggestion(query) {
        const cached = resolvedSuggestionCache.get(query);
        if (cached) return cached;

        try {
            const res = await fetch(`/search?q=${encodeURIComponent(query)}`);
            if (!res.ok) return null;
            const data = await res.json();
            const video = Array.isArray(data) ? data[0] : null;
            if (!video) return null;

            const resolved = {
                url: video.url,
                thumbnail: video.thumbnail || (video.id ? `https://img.youtube.com/vi/${video.id}/hqdefault.jpg` : '')
            };
            resolvedSuggestionCache.set(query, resolved);
            return resolved;
        } catch {
            return null;
        }
    }

    function applySuggestionResolution(card, resolved) {
        if (!card || !resolved) return;
        if (resolved.url) card.dataset.url = resolved.url;
        card.classList.add('is-resolved');

        const thumb = card.querySelector('.suggestion-thumb');
        if (thumb && resolved.thumbnail) {
            thumb.innerHTML = `<img src="${escapeHtml(resolved.thumbnail)}" alt="">`;
        }
    }

    async function hydrateSuggestionCards(picks, renderToken) {
        await Promise.allSettled(picks.map(async (item, index) => {
            const query = `${item.title} ${item.artist}`;
            const resolved = await resolveSuggestion(query);

            if (renderToken !== suggestionRenderToken) return;
            const card = elements.converter.suggestions?.querySelector(`[data-suggestion-index="${index}"]`);
            applySuggestionResolution(card, resolved);
        }));
    }

    function renderRecentCarousel(history) {
        const carousel = document.getElementById('recentCarousel');
        const section = document.getElementById('recentlyPlayedSection');
        if (!carousel || !section) return;
        if (history.length > 0) {
            section.classList.remove('hidden');
            carousel.innerHTML = '';
            history.slice(0, 8).forEach((item, i) => {
                const thumb = getThumb(item).replace('hqdefault', 'maxresdefault');
                const div = document.createElement('div');
                div.className = 'recent-tile';
                div.innerHTML = `
                    <div class="recent-art">
                        <img src="${escapeHtml(thumb)}" alt="" onerror="this.src='https://img.youtube.com/vi/${escapeHtml(item.id)}/hqdefault.jpg';">
                    </div>
                    <div class="recent-title">${escapeHtml(item.title)}</div>
                `;
                div.onclick = () => playTrack(i);
                carousel.appendChild(div);
            });
        } else {
            section.classList.add('hidden');
        }
    }

    function renderDashboardLibrary(history) {
        const list = elements.dashboard.libraryList;
        if (!list) return;
        list.innerHTML = '';
        if (history.length === 0) {
            list.innerHTML = '<div class="dashboard-empty">Your recent tracks will appear here.</div>';
            return;
        }

        history.slice(0, 5).forEach((item, i) => {
            const thumb = getThumb(item);
            const row = document.createElement('div');
            row.className = 'dashboard-library-item';
            row.onclick = () => playTrack(i);
            row.innerHTML = `
                <div class="dashboard-library-art">
                    <img src="${escapeHtml(thumb)}" alt="">
                </div>
                <div>
                    <div class="dashboard-library-title">${escapeHtml(item.title)}</div>
                    <div class="dashboard-library-meta">${escapeHtml(item.duration || '0:00')} • ${escapeHtml(item.date || 'Added')}</div>
                </div>
            `;
            list.appendChild(row);
        });
    }

    function renderHistory(data) {
        const list = document.getElementById('historyList');
        const empty = document.getElementById('emptyHistory');
        if (!list || !empty) return;
        list.innerHTML = '';
        if (data.length === 0) {
            empty.classList.remove('hidden');
        } else {
            empty.classList.add('hidden');
            data.forEach((item, i) => {
                const thumb = getThumb(item);
                const div = document.createElement('div');
                div.className = 'history-list-item';
                div.onclick = () => playTrack(i);
                
                div.innerHTML = `
                    <div class="item-artwork">
                        <img src="${escapeHtml(thumb)}" alt="">
                    </div>
                    <div class="item-details">
                        <div class="item-title">${escapeHtml(item.title)}</div>
                        <div class="item-artist">YouTube • ${escapeHtml(item.duration || '0:00')}</div>
                    </div>
                    <div class="item-actions">
                        <button class="track-menu-btn" aria-label="Track options">
                            <ion-icon name="ellipsis-horizontal"></ion-icon>
                        </button>
                    </div>
                `;
                list.appendChild(div);
            });
        }
    }

    // --- Header Scroll Effect ---
    window.addEventListener('scroll', () => {
        const header = document.querySelector('.navbar');
        if (header) header.classList.toggle('scrolled', window.scrollY > 20);
    });

    window.addEventListener('resize', updateMiniTitleMotion);
    if (document.fonts?.ready) {
        document.fonts.ready.then(updateMiniTitleMotion).catch(() => {});
    }

    // --- Audio Player Logic ---
    function updateQueuePosition() {
        const total = currentPlaylist.length;
        const current = currentTrackIndex >= 0 && total > 0 ? currentTrackIndex + 1 : 0;
        const label = `${current} of ${total}`;
        if (elements.player.queuePosition) elements.player.queuePosition.textContent = label;
        if (largeQueueMeta) largeQueueMeta.textContent = label;
        renderLargeQueue();
    }

    function setLargeQueueOpen(isOpen) {
        if (!largeQueuePanel || !largeQueueBtn || !nowPlayingOverlay) return;
        if (isOpen) setLargeLyricsOpen(false);
        largeQueuePanel.classList.toggle('hidden', !isOpen);
        nowPlayingOverlay.classList.toggle('is-queue-open', isOpen);
        largeQueueBtn.classList.toggle('is-active', isOpen);
        largeQueueBtn.setAttribute('aria-expanded', String(isOpen));
        largeQueueBtn.setAttribute('aria-label', isOpen ? 'Hide queue' : 'Show queue');
        setNowPlayingHeader(isOpen ? 'Up Next' : 'Now Playing');
        if (largeQueueIcon) largeQueueIcon.setAttribute('name', isOpen ? 'albums-outline' : 'list-outline');
        if (isOpen) {
            requestAnimationFrame(() => {
                const active = largeQueuePanel.querySelector('.large-queue-item.is-active');
                active?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
            });
        }
    }

    function setLargeLyricsOpen(isOpen) {
        if (!largeLyricsPanel || !largeLyricsBtn || !nowPlayingOverlay) return;
        if (isOpen) setLargeQueueOpen(false);
        largeLyricsPanel.classList.toggle('hidden', !isOpen);
        nowPlayingOverlay.classList.toggle('is-lyrics-open', isOpen);
        largeLyricsBtn.classList.toggle('is-active', isOpen);
        largeLyricsBtn.setAttribute('aria-expanded', String(isOpen));
        largeLyricsBtn.setAttribute('aria-label', isOpen ? 'Hide lyrics' : 'Show lyrics');
        if (largeLyricsIcon) largeLyricsIcon.setAttribute('name', isOpen ? 'reader' : 'reader-outline');
        setNowPlayingHeader(isOpen ? 'Lyrics' : 'Now Playing');

        if (isOpen) {
            const track = getCurrentTrack();
            loadLyricsForTrack(track);
        }
    }

    function renderLargeQueue() {
        if (!largeQueuePanel) return;

        if (currentPlaylist.length === 0) {
            largeQueuePanel.innerHTML = `
                <div class="large-queue-empty">
                    <ion-icon name="musical-notes-outline"></ion-icon>
                    <span>No tracks yet</span>
                </div>
            `;
            return;
        }

        const rows = currentPlaylist.slice(0, 20).map((item, index) => {
            const isActive = index === currentTrackIndex;
            return `
                <button class="large-queue-item${isActive ? ' is-active' : ''}" type="button" data-index="${index}">
                    <span class="large-queue-art">
                        <img src="${escapeHtml(getThumb(item))}" alt="">
                    </span>
                    <span class="large-queue-copy">
                        <strong>${escapeHtml(item.title || 'Untitled Track')}</strong>
                        <small>${escapeHtml(item.duration || '0:00')}</small>
                    </span>
                    <ion-icon name="${isActive ? 'volume-high-outline' : 'play-outline'}"></ion-icon>
                </button>
            `;
        }).join('');

        largeQueuePanel.innerHTML = `
            <div class="large-queue-heading">
                <span>Up Next</span>
                <small>${currentPlaylist.length} track${currentPlaylist.length === 1 ? '' : 's'}</small>
            </div>
            <div class="large-queue-list">${rows}</div>
        `;
    }

    function renderLyricsShell(state, track, message = '') {
        if (!largeLyricsPanel) return;
        const isLoading = state === 'loading';
        const isInstrumental = state === 'instrumental';
        currentLyrics = [];
        currentLyricIndex = -1;
        lyricsLineNodes = [];
        if (lyricsAutoScrollFrame) {
            cancelAnimationFrame(lyricsAutoScrollFrame);
            lyricsAutoScrollFrame = null;
        }
        largeLyricsPanel.scrollTop = 0;
        largeLyricsPanel.innerHTML = `
            <div class="lyrics-panel-header">
                <span>Lyrics</span>
                <small>${isLoading ? 'Loading synced lines' : escapeHtml(message || 'Synced to this track')}</small>
            </div>
            <div class="lyrics-empty">
                <ion-icon name="${isLoading ? 'sync-outline' : 'musical-notes-outline'}"></ion-icon>
                <strong>${isLoading ? 'Finding lyrics...' : (isInstrumental ? 'Instrumental track' : 'Lyrics not available')}</strong>
                <span>${escapeHtml(message || 'Try another track or check back later.')}</span>
            </div>
        `;
    }

    function prepareLyricLines(lines = [], duration = 0) {
        const clean = lines
            .map(line => ({ time: typeof line.time === 'number' ? line.time : null, text: String(line.text || '').trim() }))
            .filter(line => line.text);

        if (!clean.length) return [];
        if (clean.every(line => line.time === null) && duration > 0) {
            const step = duration / Math.max(clean.length, 1);
            return clean.map((line, index) => ({ ...line, time: Math.max(0, index * step) }));
        }
        return clean.map((line, index) => ({ ...line, time: line.time ?? index * 4 }));
    }

    function renderLyrics(track, payload) {
        if (!largeLyricsPanel) return;
        const query = getLyricsQuery(track);
        currentLyrics = prepareLyricLines(payload.lines, query.duration || elements.player.audio.duration || 0);
        currentLyricIndex = -1;

        if (!currentLyrics.length) {
            renderLyricsShell(payload.instrumental || payload.status === 'instrumental' ? 'instrumental' : 'missing', track, payload.message);
            return;
        }

        const source = payload.source ? `${payload.synced ? 'Synced' : 'Lyrics'} by ${payload.source}` : '';
        const lyricMeta = source || payload.artist || query.artist || 'Synced to this track';
        if (lyricsAutoScrollFrame) {
            cancelAnimationFrame(lyricsAutoScrollFrame);
            lyricsAutoScrollFrame = null;
        }
        largeLyricsPanel.innerHTML = `
            <div class="lyrics-panel-header">
                <span>Lyrics</span>
                <small>${escapeHtml(lyricMeta)}</small>
            </div>
            <div class="lyrics-lines">
                ${currentLyrics.map((line, index) => `
                    <div class="lyric-line is-upcoming" data-lyric-index="${index}">${escapeHtml(line.text)}</div>
                `).join('')}
            </div>
        `;
        lyricsLineNodes = Array.from(largeLyricsPanel.querySelectorAll('.lyric-line'));
        updateLyricsPosition(true);
    }

    async function loadLyricsForTrack(track) {
        const requestToken = ++lyricsRequestToken;
        if (!track) {
            currentLyrics = [];
            currentLyricIndex = -1;
            renderLyricsShell('missing', null, 'Play a track to see lyrics.');
            return;
        }

        const query = getLyricsQuery(track);
        const key = `${track.id || track.filename || query.title}|${query.artist}|${query.duration}`;
        if (lyricsCache.has(key)) {
            if (requestToken !== lyricsRequestToken) return;
            renderLyrics(track, lyricsCache.get(key));
            return;
        }

        renderLyricsShell('loading', track);
        try {
            const params = new URLSearchParams({
                title: query.title || track.title || '',
                artist: query.artist || '',
                duration: String(query.duration || 0)
            });
            const response = await fetch(`/lyrics?${params.toString()}`);
            const payload = response.ok ? await response.json() : { status: 'error', lines: [], message: 'Lyrics lookup failed.' };
            lyricsCache.set(key, payload);
            if (requestToken !== lyricsRequestToken) return;
            renderLyrics(track, payload);
        } catch {
            if (requestToken !== lyricsRequestToken) return;
            renderLyricsShell('missing', track, 'Lyrics lookup failed.');
        }
    }

    function updateLyricsPosition(force = false) {
        if (!largeLyricsPanel || largeLyricsPanel.classList.contains('hidden') || !currentLyrics.length || !lyricsLineNodes.length) return;

        const now = elements.player.audio.currentTime || 0;
        let low = 0;
        let high = currentLyrics.length - 1;
        let activeIndex = 0;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if ((currentLyrics[mid].time || 0) <= now + 0.2) {
                activeIndex = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        if (!force && activeIndex === currentLyricIndex) return;
        const previousIndex = currentLyricIndex;
        currentLyricIndex = activeIndex;

        const syncNodeState = (node, index) => {
            node.classList.toggle('is-past', index < activeIndex);
            node.classList.toggle('is-current', index === activeIndex);
            node.classList.toggle('is-upcoming', index > activeIndex);
        };

        if (force || previousIndex < 0 || Math.abs(activeIndex - previousIndex) > 4) {
            lyricsLineNodes.forEach(syncNodeState);
        } else {
            const start = Math.max(0, Math.min(previousIndex, activeIndex) - 1);
            const end = Math.min(lyricsLineNodes.length - 1, Math.max(previousIndex, activeIndex) + 1);
            for (let index = start; index <= end; index += 1) {
                syncNodeState(lyricsLineNodes[index], index);
            }
        }

        if (!force && performance.now() < lyricsUserScrollUntil) return;
        if (lyricsAutoScrollFrame) cancelAnimationFrame(lyricsAutoScrollFrame);
        lyricsAutoScrollFrame = requestAnimationFrame(() => {
            lyricsAutoScrollFrame = null;
            const node = lyricsLineNodes[activeIndex];
            if (!node) return;
            const target = Math.max(0, node.offsetTop - ((largeLyricsPanel.clientHeight - node.offsetHeight) / 2));
            if (!force && Math.abs(largeLyricsPanel.scrollTop - target) < 28) return;
            largeLyricsPanel.scrollTo({ top: target, behavior: 'auto' });
        });
    }

    function updateMiniTitleMotion() {
        const titleEl = elements.player.title;
        if (!titleEl) return;

        titleEl.classList.remove('is-marquee');
        titleEl.removeAttribute('data-marquee');
        titleEl.style.removeProperty('--marquee-speed');

        requestAnimationFrame(() => {
            const text = titleEl.textContent.trim();
            const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (!text || text === 'Not Playing' || prefersReducedMotion) return;

            const shouldScroll = titleEl.scrollWidth > titleEl.clientWidth + 8;
            if (!shouldScroll) return;

            const speed = Math.min(18, Math.max(9, text.length * 0.22));
            titleEl.setAttribute('data-marquee', text);
            titleEl.style.setProperty('--marquee-speed', `${speed}s`);
            titleEl.classList.add('is-marquee');
        });
    }

    function setArtwork(target, track, radius = '12px', highRes = false) {
        if (!target) return;
        if (!track) {
            target.innerHTML = '<ion-icon name="musical-note"></ion-icon>';
            return;
        }
        const thumb = highRes ? getLargeThumb(track) : getThumb(track);
        const fallback = getThumb(track);
        const fallbackHandler = highRes ? ` onerror="this.onerror=null; this.src='${escapeHtml(fallback)}';"` : '';
        target.innerHTML = `<img src="${escapeHtml(thumb)}" alt="" style="border-radius: ${radius};"${fallbackHandler}>`;
    }

    function resetPlayerDisplay() {
        currentTrackIndex = -1;
        elements.player.audio.pause();
        elements.player.audio.removeAttribute('src');
        elements.player.audio.load();
        if (elements.player.title) elements.player.title.textContent = 'Not Playing';
        if (elements.player.artist) elements.player.artist.textContent = 'Choose a track';
        if (largeTrackTitle) largeTrackTitle.textContent = 'Not Playing';
        if (largeArtistName) largeArtistName.textContent = 'Choose a track';
        setNowPlayingHeader('Now Playing');
        if (elements.player.current) elements.player.current.textContent = '0:00';
        if (elements.player.total) elements.player.total.textContent = '0:00';
        if (largeCurrentTime) largeCurrentTime.textContent = '0:00';
        if (largeTotalTime) largeTotalTime.textContent = '0:00';
        if (elements.player.seekbar) { elements.player.seekbar.value = 0; updateSliderTrack(elements.player.seekbar); }
        if (largeSeekbar) { largeSeekbar.value = 0; updateSliderTrack(largeSeekbar); }
        setArtwork(document.getElementById('playerArtwork'), null);
        setArtwork(largeArtwork, null);
        currentLyrics = [];
        currentLyricIndex = -1;
        if (largeLyricsPanel && !largeLyricsPanel.classList.contains('hidden')) {
            renderLyricsShell('missing', null, 'Play a track to see lyrics.');
        }
        updateQueuePosition();
        updateMiniTitleMotion();
    }

    function syncLargePlayer(track) {
        if (!track && currentTrackIndex !== -1) track = currentPlaylist[currentTrackIndex];
        if (!track) {
            resetPlayerDisplay();
            return;
        }

        const title = track.title || 'Untitled Track';
        const subtitle = getTrackSubtitle(track);

        if (elements.player.title) elements.player.title.textContent = title;
        if (elements.player.artist) elements.player.artist.textContent = subtitle;
        if (largeTrackTitle) largeTrackTitle.textContent = title;
        if (largeArtistName) largeArtistName.textContent = subtitle;
        setNowPlayingHeader();
        updateQueuePosition();
        updateMiniTitleMotion();
        setArtwork(document.getElementById('playerArtwork'), track, '12px');
        setArtwork(largeArtwork, track, '24px', true);
        if (largeLyricsPanel && !largeLyricsPanel.classList.contains('hidden')) {
            loadLyricsForTrack(track);
        }
        
        if (nowPlayingBg) {
            const hash = title.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
            const hue = Math.abs(hash % 360);
            nowPlayingBg.style.setProperty('--player-hue', hue);
            nowPlayingBg.style.setProperty('--player-hue-two', (hue + 120) % 360);
            nowPlayingBg.style.setProperty('--player-hue-three', (hue + 240) % 360);
        }
    }

    function playTrack(i) {
        if (i < 0 || i >= currentPlaylist.length) return;
        currentTrackIndex = i;
        const track = currentPlaylist[i];
        if (!track.filename) {
            showToast('Track file is not available.');
            return;
        }
        syncLargePlayer(track);
        elements.player.audio.src = `/stream/${encodeURIComponent(track.filename)}`;
        setPlaybackIcon(true);
        elements.player.audio.play().catch(() => {
            setPlaybackIcon(false);
            showToast('Unable to play this track.');
        });
        elements.player.container.classList.add('active');
    }

    function playPreviousTrack() {
        if (currentPlaylist.length === 0) {
            showToast('No tracks in your queue.');
            return;
        }
        const target = currentTrackIndex <= 0 ? currentPlaylist.length - 1 : currentTrackIndex - 1;
        playTrack(target);
    }

    function playNextTrack() {
        if (currentPlaylist.length === 0) {
            showToast('No tracks in your queue.');
            return;
        }
        const target = currentTrackIndex < 0 || currentTrackIndex >= currentPlaylist.length - 1 ? 0 : currentTrackIndex + 1;
        playTrack(target);
    }

    function togglePlay() {
        if (!elements.player.audio.src) {
            if (currentPlaylist.length > 0) playTrack(Math.max(currentTrackIndex, 0));
            else showToast('Add a track to your library first.');
            return;
        }
        if (elements.player.audio.paused) {
            setPlaybackIcon(true);
            elements.player.audio.play().catch(() => {
                setPlaybackIcon(false);
                showToast('Unable to play this track.');
            });
        } else {
            setPlaybackIcon(false);
            elements.player.audio.pause();
        }
    }

    const playAllBtn = document.getElementById('playAllBtn');
    const shuffleBtn = document.getElementById('shuffleBtn');

    if (playAllBtn) {
        playAllBtn.addEventListener('click', () => {
            if (currentPlaylist.length > 0) playTrack(0);
        });
    }

    if (shuffleBtn) {
        shuffleBtn.addEventListener('click', () => {
            if (currentPlaylist.length > 0) {
                const randomIndex = Math.floor(Math.random() * currentPlaylist.length);
                playTrack(randomIndex);
            }
        });
    }

    elements.player.audio.addEventListener('play', () => {
        setPlaybackIcon(true);
        startProgressLoop();
    });

    elements.player.audio.addEventListener('pause', () => {
        setPlaybackIcon(false);
        stopProgressLoop();
    });

    elements.player.audio.addEventListener('ended', () => {
        stopProgressLoop();
        if (currentPlaylist.length > 1) playNextTrack();
    });

    function updateSliderTrack(el) {
        if (!el) return;
        const val = ((el.value - (el.min || 0)) / ((el.max || 100) - (el.min || 0))) * 100;
        const pct = Math.max(0, Math.min(100, val));
        el.style.setProperty('--range-progress', `${pct}%`);
        el.style.removeProperty('background');
    }

    function syncPlaybackPosition() {
        const audio = elements.player.audio;
        const time = formatTime(audio.currentTime);
        if (elements.player.current && elements.player.current.textContent !== time) elements.player.current.textContent = time;
        if (largeCurrentTime && largeCurrentTime.textContent !== time) largeCurrentTime.textContent = time;

        const pct = (audio.currentTime / audio.duration) * 100 || 0;
        [elements.player.seekbar, largeSeekbar].filter(Boolean).forEach(el => {
            el.value = pct;
            if (isVisible(el)) updateSliderTrack(el);
        });
        updateLyricsPosition();
    }

    function startProgressLoop() {
        if (progressFrame) return;
        const tick = (timestamp) => {
            if (!lastProgressRender || timestamp - lastProgressRender >= 250) {
                syncPlaybackPosition();
                lastProgressRender = timestamp;
            }
            if (!elements.player.audio.paused && !elements.player.audio.ended) {
                progressFrame = requestAnimationFrame(tick);
            } else {
                progressFrame = null;
                lastProgressRender = 0;
            }
        };
        progressFrame = requestAnimationFrame(tick);
    }

    function stopProgressLoop() {
        if (progressFrame) {
            cancelAnimationFrame(progressFrame);
            progressFrame = null;
        }
        syncPlaybackPosition();
    }

    function bindSliderState(el) {
        if (!el) return;
        const clearScrubbing = () => {
            el.classList.remove('is-scrubbing');
            window.removeEventListener('pointerup', clearScrubbing);
            window.removeEventListener('pointercancel', clearScrubbing);
        };
        el.addEventListener('pointerdown', () => {
            el.classList.add('is-scrubbing');
            window.addEventListener('pointerup', clearScrubbing);
            window.addEventListener('pointercancel', clearScrubbing);
        });
        el.addEventListener('blur', clearScrubbing);
    }

    elements.player.audio.addEventListener('timeupdate', () => {
        if (!progressFrame) syncPlaybackPosition();
    });

    elements.player.audio.addEventListener('loadedmetadata', () => {
        const duration = formatTime(elements.player.audio.duration);
        if (elements.player.total) elements.player.total.textContent = duration;
        if (largeTotalTime) largeTotalTime.textContent = duration;
        syncPlaybackPosition();
    });

    const seekbars = [elements.player.seekbar, largeSeekbar].filter(Boolean);
    seekbars.forEach(el => {
        bindSliderState(el);
        el.addEventListener('input', (e) => {
            const pct = Number(e.target.value) || 0;
            if (elements.player.audio.duration) {
                elements.player.audio.currentTime = (pct / 100) * elements.player.audio.duration;
            }
            seekbars.forEach(bar => {
                bar.value = pct;
                updateSliderTrack(bar);
            });
        });
    });

    const volumes = [elements.player.volume, largeVolume].filter(Boolean);
    volumes.forEach(el => {
        bindSliderState(el);
        el.addEventListener('input', (e) => {
            elements.player.audio.volume = e.target.value / 100;
            volumes.forEach(v => { v.value = e.target.value; updateSliderTrack(v); });
        });
    });

    const playButtons = [elements.player.playBtn, largePlayBtn].filter(Boolean);
    const rewindButtons = [document.getElementById('playerRewindBtn'), document.getElementById('largeRewindBtn')].filter(Boolean);
    const forwardButtons = [document.getElementById('playerForwardBtn'), document.getElementById('largeForwardBtn')].filter(Boolean);

    playButtons.forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); }));
    
    rewindButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            playPreviousTrack();
        });
    });

    forwardButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            playNextTrack();
        });
    });

    if (elements.converter.refreshSuggestions) {
        elements.converter.refreshSuggestions.addEventListener('click', () => {
            renderSuggestions(currentPlaylist);
        });
    }

    if (elements.converter.suggestions) {
        elements.converter.suggestions.addEventListener('click', async (e) => {
            const card = e.target.closest('.suggestion-card');
            if (!card || card.classList.contains('is-loading')) return;

            const query = card.dataset.query || '';
            let target = card.dataset.url || '';
            if (!target && query) {
                card.classList.add('is-loading');
                card.setAttribute('aria-busy', 'true');
                const resolved = await resolveSuggestion(query);
                applySuggestionResolution(card, resolved);
                target = resolved?.url || query;
                card.classList.remove('is-loading');
                card.removeAttribute('aria-busy');
            }

            target = target || query;
            if (!target) return;
            elements.converter.input.value = target;
            elements.converter.input.focus();
            document.getElementById('searchResults')?.classList.add('hidden');
            if (typeof elements.converter.form.requestSubmit === 'function') elements.converter.form.requestSubmit();
            else elements.converter.form.dispatchEvent(new Event('submit', { cancelable: true }));
        });
    }

    if (elements.player.container) {
        elements.player.container.addEventListener('click', (e) => {
            if (e.target.closest('button') || e.target.closest('input')) return;
            if (nowPlayingOverlay) {
                nowPlayingOverlay.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
                syncLargePlayer();
                syncPlaybackPosition();
                renderLargeQueue();
            }
        });
    }

    if (closeNowPlaying) {
        closeNowPlaying.addEventListener('click', () => {
            if (largeQueuePanel && !largeQueuePanel.classList.contains('hidden')) {
                setLargeQueueOpen(false);
                return;
            }
            if (largeLyricsPanel && !largeLyricsPanel.classList.contains('hidden')) {
                setLargeLyricsOpen(false);
                return;
            }
            if (nowPlayingOverlay) nowPlayingOverlay.classList.add('hidden');
            setLargeQueueOpen(false);
            setLargeLyricsOpen(false);
            document.body.style.overflow = '';
        });
    }

    if (largeQueueBtn) {
        largeQueueBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            renderLargeQueue();
            setLargeQueueOpen(largeQueuePanel ? largeQueuePanel.classList.contains('hidden') : false);
        });
    }

    if (largeLyricsBtn) {
        largeLyricsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setLargeLyricsOpen(largeLyricsPanel ? largeLyricsPanel.classList.contains('hidden') : false);
        });
    }

    if (largeLyricsPanel) {
        const pauseLyricsAutoScroll = () => {
            lyricsUserScrollUntil = performance.now() + 1400;
        };
        largeLyricsPanel.addEventListener('wheel', pauseLyricsAutoScroll, { passive: true });
        largeLyricsPanel.addEventListener('touchstart', pauseLyricsAutoScroll, { passive: true });
        largeLyricsPanel.addEventListener('pointerdown', pauseLyricsAutoScroll, { passive: true });
    }

    if (largeQueuePanel) {
        largeQueuePanel.addEventListener('pointerdown', (e) => {
            queuePointerStart = {
                y: e.clientY,
                scrollTop: largeQueuePanel.scrollTop
            };
        }, { passive: true });

        largeQueuePanel.addEventListener('click', (e) => {
            const row = e.target.closest('.large-queue-item');
            if (!row) return;
            const scrolled = queuePointerStart
                ? Math.abs(largeQueuePanel.scrollTop - queuePointerStart.scrollTop) > 6 || Math.abs(e.clientY - queuePointerStart.y) > 8
                : false;
            queuePointerStart = null;
            if (scrolled) return;
            const index = Number(row.dataset.index);
            if (Number.isInteger(index)) playTrack(index);
        });
    }

    // --- Search Logic ---
    const searchResults = document.getElementById('searchResults');
    let searchTimeout = null;

    elements.converter.input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(searchTimeout);
        if (query.length < 1 || query.startsWith('http')) {
            searchResults.classList.add('hidden');
            return;
        }
        searchTimeout = setTimeout(async () => {
            searchResults.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-secondary); font-size: 13px; font-weight: 600;"><ion-icon name="sync-outline" style="animation: spin 1s linear infinite; margin-right: 8px;"></ion-icon>Searching YouTube...</div>';
            searchResults.classList.remove('hidden');
            try {
                const res = await fetch(`/search?q=${encodeURIComponent(query)}`);
                const data = await res.json();
                if (data && data.length > 0) {
                    renderSearchResults(data);
                } else {
                    searchResults.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-secondary); font-size: 13px;">No results found</div>';
                }
            } catch (e) {
                searchResults.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--error-color);">Connection error</div>';
            }
        }, 500);
    });

    function renderSearchResults(results) {
        searchResults.innerHTML = '';
        results.forEach(video => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `
                <div style="position: relative; width: 110px; height: 64px; border-radius: 12px; overflow: hidden; flex-shrink: 0;">
                    <img src="${escapeHtml(video.thumbnail)}" alt="" style="width: 100%; height: 100%; object-fit: cover;">
                    <div style="position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,0.7); color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${escapeHtml(video.duration)}</div>
                </div>
                <div class="item-info" style="margin-left: 12px;">
                    <div class="item-title" style="font-size: 15px; font-weight: 700; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(video.title)}</div>
                    <div class="item-meta" style="font-size: 12px; margin-top: 2px;">YouTube Video</div>
                </div>
                <div style="margin-left: auto;">
                    <button class="play-item-btn" style="background: var(--accent-color); color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; box-shadow: 0 4px 12px rgba(var(--accent-rgb), 0.3);">
                        <ion-icon name="arrow-down-outline"></ion-icon>
                    </button>
                </div>
            `;
            div.onmouseenter = () => div.style.background = 'rgba(0,0,0,0.03)';
            div.onmouseleave = () => div.style.background = 'transparent';
            div.onclick = () => {
                elements.converter.input.value = video.url;
                searchResults.classList.add('hidden');
                if (typeof elements.converter.form.requestSubmit === 'function') elements.converter.form.requestSubmit();
                else elements.converter.form.dispatchEvent(new Event('submit', { cancelable: true }));
            };
            searchResults.appendChild(div);
        });
    }

    // --- Converter ---
    elements.converter.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = elements.converter.input.value.trim();
        if (!url) return;
        elements.converter.btn.disabled = true;
        elements.converter.btnText.textContent = 'Preparing...';
        elements.converter.progress.classList.remove('hidden');
        elements.converter.fill.style.width = '0%';
        elements.converter.percent.textContent = '0%';
        elements.converter.status.textContent = 'Preparing...';
        const fd = new FormData();
        fd.append('url', url);
        try {
            const res = await fetch('/convert', { method: 'POST', body: fd });
            if (res.ok) {
                // Listen for real-time progress via Server-Sent Events
                const eventSource = new EventSource('/progress');
                
                eventSource.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    
                    if (data.status === 'downloading') {
                        elements.converter.fill.style.width = `${data.percent}%`;
                        elements.converter.percent.textContent = `${Math.floor(data.percent)}%`;
                        elements.converter.status.textContent = data.message;
                    } 
                    else if (data.status === 'processing') {
                        elements.converter.fill.style.width = '100%';
                        elements.converter.status.textContent = data.message;
                    }
                    else if (data.status === 'finished') {
                        eventSource.close();
                        elements.converter.btnText.textContent = 'Ready!';
                        elements.converter.status.textContent = 'Success! Track added to library.';
                        
                        // Handle Guest History saving
                        if (currentUserRole === 'guest' && data.metadata) {
                            const local = JSON.parse(localStorage.getItem('guestHistory') || '[]');
                            local.unshift(data.metadata);
                            localStorage.setItem('guestHistory', JSON.stringify(local));
                        }
                        
                        setTimeout(async () => {
                            elements.converter.input.value = '';
                            elements.converter.btn.disabled = false;
                            elements.converter.btnText.textContent = 'Add';
                            elements.converter.progress.classList.add('hidden');
                            await loadHistory();
                            if (isAutoplayEnabled() && data.metadata) {
                                playTrack(0);
                            }
                        }, 2000);
                    }
                    else if (data.status === 'error') {
                        eventSource.close();
                        elements.converter.btnText.textContent = 'Error';
                        elements.converter.status.textContent = data.message;
                        elements.converter.btn.disabled = false;
                    }
                };
                eventSource.onerror = () => {
                    eventSource.close();
                    elements.converter.btnText.textContent = 'Retry';
                    elements.converter.status.textContent = 'Connection lost while tracking progress.';
                    elements.converter.btn.disabled = false;
                };
            } else {
                const body = await res.json().catch(() => ({}));
                elements.converter.btnText.textContent = 'Retry';
                elements.converter.status.textContent = body.detail || 'Conversion could not start.';
                elements.converter.btn.disabled = false;
            }
        } catch (e) {
            elements.converter.btnText.textContent = 'Failed';
            elements.converter.status.textContent = 'Connection error. Please try again.';
            elements.converter.btn.disabled = false;
        }
    });

    // --- Sidebar & Settings ---
    if (elements.nav.toggle) elements.nav.toggle.addEventListener('click', toggleSidebar);
    if (elements.overlay) elements.overlay.addEventListener('click', () => setSidebarOpen(false));
    if (elements.nav.convert) elements.nav.convert.addEventListener('click', () => { switchPage('converter'); setSidebarOpen(false); });
    if (elements.nav.history) elements.nav.history.addEventListener('click', () => { switchPage('history'); setSidebarOpen(false); });
    if (elements.nav.settings && elements.settings.modal) {
        elements.nav.settings.addEventListener('click', () => { elements.settings.modal.classList.remove('hidden'); setSidebarOpen(false); });
    }
    if (elements.settings.close) elements.settings.close.addEventListener('click', () => elements.settings.modal && elements.settings.modal.classList.add('hidden'));
    if (elements.settings.save) {
        elements.settings.save.addEventListener('click', () => {
            if (elements.settings.autoplay) localStorage.setItem('autoPlay', elements.settings.autoplay.checked);
            if (elements.settings.modal) elements.settings.modal.classList.add('hidden');
            showToast('Settings saved');
        });
    }

    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', async () => {
            clearHistoryBtn.disabled = true;
            if (currentUserRole === 'guest') {
                localStorage.removeItem('guestHistory');
                await loadHistory();
                clearHistoryBtn.disabled = false;
                showToast('History cleared');
                return;
            }

            try {
                const res = await fetch('/clear-history', { method: 'POST' });
                if (res.ok) {
                    await loadHistory();
                    showToast('History cleared');
                } else {
                    showToast('Could not clear history');
                }
            } catch (e) {
                showToast('Connection error');
            } finally {
                clearHistoryBtn.disabled = false;
            }
        });
    }

    const init = () => {
        initTheme();
        checkAuth();
        if (elements.settings.autoplay) elements.settings.autoplay.checked = localStorage.getItem('autoPlay') !== 'false';
        // Initialize slider visuals
        [elements.player.volume, elements.player.seekbar, document.getElementById('largeVolume'), document.getElementById('largeSeekbar')]
            .forEach(el => { if (el) updateSliderTrack(el); });
        if (elements.player.volume) elements.player.audio.volume = elements.player.volume.value / 100;
        updateMiniTitleMotion();
    };

    init();
});
