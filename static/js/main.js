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
            percent: document.getElementById('percentText')
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
    const largePlayBtn = document.getElementById('largePlayBtn');
    const largePlayIcon = document.getElementById('largePlayIcon');
    const largeSeekbar = document.getElementById('largeSeekbar');
    const largeVolume = document.getElementById('largeVolume');
    const largeTrackTitle = document.getElementById('largeTrackTitle');
    const largeArtistName = document.getElementById('largeArtistName');
    const largeCurrentTime = document.getElementById('largeCurrentTime');
    const largeTotalTime = document.getElementById('largeTotalTime');
    const largeQueueMeta = document.getElementById('largeQueueMeta');
    const largeQueueBtn = document.getElementById('largeQueueBtn');
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
    const getTrackSubtitle = (track) => `${track.duration || '0:00'} • YouTube`;
    const isAutoplayEnabled = () => localStorage.getItem('autoPlay') !== 'false';
    const isVisible = (el) => Boolean(el && el.getClientRects().length);

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
        renderRecentCarousel(history);
        renderDashboardLibrary(history);
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
        largeQueuePanel.classList.toggle('hidden', !isOpen);
        nowPlayingOverlay.classList.toggle('is-queue-open', isOpen);
        largeQueueBtn.classList.toggle('is-active', isOpen);
        largeQueueBtn.setAttribute('aria-expanded', String(isOpen));
        largeQueueBtn.setAttribute('aria-label', isOpen ? 'Hide queue' : 'Show queue');
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

    function setArtwork(target, track, radius = '12px') {
        if (!target) return;
        if (!track) {
            target.innerHTML = '<ion-icon name="musical-note"></ion-icon>';
            return;
        }
        const thumb = getThumb(track);
        target.innerHTML = `<img src="${escapeHtml(thumb)}" alt="" style="border-radius: ${radius};">`;
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
        if (elements.player.current) elements.player.current.textContent = '0:00';
        if (elements.player.total) elements.player.total.textContent = '0:00';
        if (largeCurrentTime) largeCurrentTime.textContent = '0:00';
        if (largeTotalTime) largeTotalTime.textContent = '0:00';
        if (elements.player.seekbar) { elements.player.seekbar.value = 0; updateSliderTrack(elements.player.seekbar); }
        if (largeSeekbar) { largeSeekbar.value = 0; updateSliderTrack(largeSeekbar); }
        setArtwork(document.getElementById('playerArtwork'), null);
        setArtwork(largeArtwork, null);
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
        updateQueuePosition();
        updateMiniTitleMotion();
        setArtwork(document.getElementById('playerArtwork'), track, '12px');
        setArtwork(largeArtwork, track, '24px');
        
        if (nowPlayingBg) {
            const hash = title.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
            const hue = Math.abs(hash % 360);
            nowPlayingBg.style.background = `radial-gradient(circle at 20% 30%, hsl(${hue}, 80%, 40%), transparent),
                                             radial-gradient(circle at 80% 70%, hsl(${(hue+120)%360}, 80%, 30%), transparent),
                                             hsl(${(hue+240)%360}, 40%, 10%)`;
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
        elements.player.audio.src = `/stream/${encodeURIComponent(track.filename)}`;
        elements.player.audio.play().catch(() => showToast('Unable to play this track.'));
        syncLargePlayer(track);
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
            elements.player.audio.play().catch(() => showToast('Unable to play this track.'));
        } else {
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
        if (elements.player.playIcon) elements.player.playIcon.setAttribute('name', 'pause-sharp');
        if (largePlayIcon) largePlayIcon.setAttribute('name', 'pause-sharp');
        startProgressLoop();
    });

    elements.player.audio.addEventListener('pause', () => {
        if (elements.player.playIcon) elements.player.playIcon.setAttribute('name', 'play-sharp');
        if (largePlayIcon) largePlayIcon.setAttribute('name', 'play-sharp');
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
            if (nowPlayingOverlay) nowPlayingOverlay.classList.add('hidden');
            setLargeQueueOpen(false);
            document.body.style.overflow = 'auto';
        });
    }

    if (largeQueueBtn) {
        largeQueueBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            renderLargeQueue();
            setLargeQueueOpen(largeQueuePanel ? largeQueuePanel.classList.contains('hidden') : false);
        });
    }

    if (largeQueuePanel) {
        largeQueuePanel.addEventListener('click', (e) => {
            const row = e.target.closest('.large-queue-item');
            if (!row) return;
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
