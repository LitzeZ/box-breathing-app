import './style.css';

interface DOMElements {
    circle: HTMLElement;
    countdown: HTMLElement;
    decreaseBtn: HTMLElement;
    increaseBtn: HTMLElement;
    durationDisplay: HTMLElement;
    startBtn: HTMLElement;
    audioBtn: HTMLElement;
    phaseText: HTMLElement;
    progressCircle: SVGCircleElement; // More specific
    sessionTimer: HTMLElement;
    // Settings DOM
    settingsOverlay: HTMLElement;
    settingsBtn: HTMLElement;
    closeSettingsBtn: HTMLElement;
    zenModeToggle: HTMLInputElement; // Typed as input
    sessionTimeDisplay?: HTMLElement;
}

interface AppState {
    isRunning: boolean;
    isMuted: boolean;
    baseDuration: number;
    currentPhase: number;
    phaseStartTime: number;
    animationFrameId: number | null;
    sessionMinutes: number;
    sessionEndTime: number | null;
    isZenModeEnabled: boolean;
}

interface AppConfig {
    phases: string[];
    phaseClasses: string[];
    frequencies: number[];
    circleCircumference: number;
}

// Fix for Safari webkitAudioContext
declare global {
    interface Window {
        webkitAudioContext: typeof AudioContext;
    }
}

class BoxBreathingApp {
    dom: DOMElements;
    lastMouseX: number;
    lastMouseY: number;
    state: AppState;
    config: AppConfig;
    wakeLock: WakeLockSentinel | null;
    audioContext: AudioContext | null;
    lastTapTime: number; // Added missing property
    longPressTimer: ReturnType<typeof setTimeout> | null; // Typed timer
    idleTimer: ReturnType<typeof setTimeout> | null;

    constructor() {
        this.dom = {
            circle: document.getElementById("circle")!,
            countdown: document.getElementById("countdown")!,
            decreaseBtn: document.getElementById("decrease-btn")!,
            increaseBtn: document.getElementById("increase-btn")!,
            durationDisplay: document.getElementById("duration-display")!,
            startBtn: document.getElementById("start-btn")!,
            audioBtn: document.getElementById("audio-btn")!,
            phaseText: document.getElementById("phase-text")!,
            progressCircle: document.querySelector(".progress-ring circle") as SVGCircleElement,
            sessionTimer: document.getElementById("session-timer")!,
            // Settings DOM
            settingsOverlay: document.getElementById("settings-overlay")!,
            settingsBtn: document.getElementById("settings-btn")!,
            closeSettingsBtn: document.getElementById("close-settings-btn")!,
            zenModeToggle: document.getElementById("zen-mode-toggle") as HTMLInputElement
        };

        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.lastTapTime = 0;

        this.state = {
            isRunning: false,
            isMuted: false,
            baseDuration: 6.0,
            currentPhase: 0,
            phaseStartTime: 0,
            animationFrameId: null,
            sessionMinutes: 15, // Default duration setting
            sessionEndTime: null,
            isZenModeEnabled: false // Settings Preference
        };

        this.config = {
            phases: ["Inhale", "Hold", "Exhale", "Hold"],
            phaseClasses: ["inhale", "hold", "exhale", "hold-small"],
            // Use nicer chord tones (C major 7ish/Ambient)
            frequencies: [261.63, 392.00, 329.63, 196.00], // C4, G4, E4, G3
            circleCircumference: 283
        };

        this.wakeLock = null;
        this.audioContext = null;
        this.longPressTimer = null;
        this.idleTimer = null;

        this.init();
    }

    init() {
        // Initialize Timer HTML Structure once
        this.dom.sessionTimer.innerHTML = `
            <span class="timer-control" data-action="decrease">−</span>
            <span id="session-time-display">15:00</span>
            <span class="timer-control" data-action="increase">+</span>
        `;
        this.dom.sessionTimeDisplay = document.getElementById("session-time-display")!;

        this.addEventListeners();
        this.updateDisplay();
        this.updateSessionDisplay(); // Show timer immediately
        this.initZenModeListener(); // Prepare listeners
    }

    addEventListeners() {
        this.dom.startBtn.addEventListener("click", () => this.toggle());
        this.dom.audioBtn.addEventListener("click", () => this.toggleAudio());
        this.dom.decreaseBtn.addEventListener("click", () => this.changeDuration(-0.5));
        this.dom.increaseBtn.addEventListener("click", () => this.changeDuration(0.5));
        document.addEventListener("keydown", e => e.key === "Enter" && this.dom.startBtn.click());

        // Safari Audio Fix: Unlock audio on first interaction
        const unlock = async () => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            // Play silent buffer to force-start the engine
            const buffer = this.audioContext.createBuffer(1, 1, 22050);
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.start(0);

            // Remove listeners once unlocked
            document.body.removeEventListener('touchstart', unlock);
            document.body.removeEventListener('click', unlock);
        };

        document.body.addEventListener('touchstart', unlock, { once: true });
        document.body.addEventListener('click', unlock, { once: true });
        document.body.addEventListener('keydown', unlock, { once: true });

        // Timer Controls (Event Delegation)
        this.dom.sessionTimer.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (target.dataset.action === "decrease") this.adjustSessionTime(-5);
            if (target.dataset.action === "increase") this.adjustSessionTime(5);
        });

        // Hidden Feature: Long Press (1.5s) to start 15m session
        this.addLongPressListener(this.dom.circle, () => this.startSession(15));

        // Hidden Feature: Manual Double Tap detection for Mobile Reliability
        this.dom.circle.addEventListener("touchstart", (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - this.lastTapTime;

            if (tapLength < 300 && tapLength > 0) {
                // Double Tap Detected
                this.startSession(15);
                e.preventDefault(); // Prevent zoom
            }
            this.lastTapTime = currentTime;
        });

        // Settings Interactions
        this.dom.settingsBtn.addEventListener("click", () => this.toggleSettings(true));
        this.dom.closeSettingsBtn.addEventListener("click", () => this.toggleSettings(false));
        // Close on background click
        this.dom.settingsOverlay.addEventListener("click", (e) => {
            if (e.target === this.dom.settingsOverlay) this.toggleSettings(false);
        });

        // Zen Mode Toggle
        this.dom.zenModeToggle.addEventListener("change", (e) => {
            const target = e.target as HTMLInputElement;
            this.state.isZenModeEnabled = target.checked;
            this.resetIdleTimer(); // Apply immediately
        });

        // Keep dblclick for desktop mouse users
        this.dom.circle.addEventListener("dblclick", () => this.startSession(15));
    }

    addLongPressListener(element: HTMLElement, callback: () => void) {
        const start = () => {
            // Prevent default context menu only on long press intention if needed, 
            // but for now we just want to track hold.
            this.longPressTimer = setTimeout(() => {
                callback();
                this.triggerHaptic(); // Feedback for activation
            }, 1500); // 1.5 seconds hold
        };

        const cancel = () => {
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
        };

        // Touch events
        element.addEventListener("touchstart", start, { passive: true });
        element.addEventListener("touchend", cancel);
        element.addEventListener("touchmove", cancel); // Cancel if scrolling

        // Mouse events (for desktop testing)
        element.addEventListener("mousedown", start);
        element.addEventListener("mouseup", cancel);
        element.addEventListener("mouseleave", cancel);
    }

    adjustSessionTime(deltaMinutes: number) {
        // Adjust the setting
        this.state.sessionMinutes += deltaMinutes;
        if (this.state.sessionMinutes < 1) this.state.sessionMinutes = 1;

        // If running, adjust the current end time
        if (this.state.isRunning && this.state.sessionEndTime) {
            this.state.sessionEndTime += deltaMinutes * 60 * 1000;
            // Prevent negative time or immediate stop (min 10 seconds buffer)
            const now = performance.now();
            if (this.state.sessionEndTime < now + 10000) {
                this.state.sessionEndTime = now + 10000;
            }
        }

        this.updateSessionDisplay();
        this.triggerHaptic();
    }

    updateSessionDisplay() {
        // Decide what to show: Remaining time if running, or Setting if stopped
        let displayMinutes = this.state.sessionMinutes;
        let displaySeconds = 0;

        if (this.state.isRunning && this.state.sessionEndTime) {
            const now = performance.now();
            const remaining = Math.max(0, Math.ceil((this.state.sessionEndTime - now) / 1000));
            displayMinutes = Math.floor(remaining / 60);
            displaySeconds = remaining % 60;
        }

        const timeString = `${displayMinutes}:${displaySeconds.toString().padStart(2, '0')} `;

        if (this.dom.sessionTimeDisplay) {
            this.dom.sessionTimeDisplay.textContent = timeString;
        }
    }

    startSession(minutes: number) {
        // Triggered by shortcuts (Double Tap / Long Press)
        this.state.sessionMinutes = minutes;
        this.updateSessionDisplay();
        this.start();
    }

    changeDuration(delta: number) {
        const oldValue = this.state.baseDuration;
        let newValue = oldValue + delta;

        // Clamp between 3s and 30s
        newValue = Math.max(3, Math.min(30, newValue));

        if (newValue === oldValue) return; // No change

        this.state.baseDuration = newValue;
        this.updateDisplay();

        // Adjust start time to keep phase progress valid if changing duration mid-cycle
        if (this.state.isRunning) {
            const now = performance.now();
            const elapsed = (now - this.state.phaseStartTime) / 1000;
            const progress = elapsed / oldValue;
            // New start time = now - (progress * new duration)
            this.state.phaseStartTime = now - (progress * this.state.baseDuration * 1000);
        }
    }

    updateDisplay() {
        this.dom.durationDisplay.textContent = `${this.state.baseDuration.toFixed(1)} s`;
    }

    async toggle() {
        if (this.state.isRunning) {
            this.stop();
        } else {
            await this.start();
        }
    }

    async start() {
        this.state.isRunning = true;
        // Start Timer based on current setting
        const now = performance.now();
        this.state.sessionEndTime = now + (this.state.sessionMinutes * 60 * 1000);
        this.updateSessionDisplay();

        this.dom.startBtn.textContent = "Stop";
        this.dom.startBtn.classList.add("stop");

        // Start from inhale scale with centering
        // Start from inhale scale
        this.dom.circle.style.transform = "scale(0.35)";

        // Initialize Audio context if needed (must be user initiated)
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
        } catch (e) {
            console.error("Audio init error:", e);
        }

        await this.requestWakeLock();
        this.startBreathing();
        this.resetIdleTimer(); // Start Zen Mode monitoring (if enabled)
    }

    stop() {
        this.state.isRunning = false;
        if (this.state.animationFrameId !== null) {
            cancelAnimationFrame(this.state.animationFrameId);
        }

        this.dom.startBtn.textContent = "Start";
        this.dom.startBtn.classList.remove("stop");
        this.dom.circle.className = "circle stopped";

        this.dom.circle.style.removeProperty("--scale");

        // Reset Session Timer State (keep visibility)
        this.state.sessionEndTime = null;
        this.updateSessionDisplay(); // Show original setting again

        this.animateText("Box Breathing");
        this.dom.countdown.textContent = "";
        this.dom.progressCircle.style.strokeDashoffset = this.config.circleCircumference as unknown as string; // Casting or correct type usage. strokeDashoffset accepts string or number usually.

        this.releaseWakeLock();
    }

    startBreathing() {
        this.state.phaseStartTime = performance.now();
        this.state.currentPhase = -1; // Will become 0 in nextPhase
        this.nextPhase();
        this.loop();
    }

    loop() {
        if (!this.state.isRunning) return;

        const now = performance.now();
        const elapsed = (now - this.state.phaseStartTime) / 1000;

        if (elapsed >= this.state.baseDuration) {
            this.nextPhase();
        } else {
            this.updateUI(elapsed);
        }

        this.state.animationFrameId = requestAnimationFrame(() => this.loop());
    }

    nextPhase() {
        this.state.currentPhase = (this.state.currentPhase + 1) % this.config.phases.length;
        this.state.phaseStartTime = performance.now();

        // Update UI State FIRST (Critical Path)
        const currentClass = this.config.phaseClasses[this.state.currentPhase];
        this.dom.circle.className = `circle ${currentClass} `;

        this.dom.circle.style.setProperty("--dur", `${this.state.baseDuration}s`);

        // Scale handled by updateUI now, no need to set --scale or use CSS classes for scale animation
        this.dom.circle.style.removeProperty("--scale");

        const phaseName = this.config.phases[this.state.currentPhase];
        this.animateText(phaseName);

        // Secondary Effects (Audio/Haptic) - Safe execution
        try {
            this.playPhaseSound();
            this.playDeepPush(); // Restore "Push" sound
            this.triggerHaptic();
        } catch (e) {
            console.warn("Audio feedback error:", e);
        }
    }

    // Easing Function (Ease In Out Cubic - Matches previous CSS)
    easeInOut(t: number) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    updateUI(elapsed: number) {
        const remaining = Math.max(0, this.state.baseDuration - elapsed);
        this.dom.countdown.textContent = Math.ceil(remaining).toString() || "";

        const phaseProgress = elapsed / this.state.baseDuration; // 0 to 1
        // Clamp progress to ensure no overshooting
        const t = Math.max(0, Math.min(1, phaseProgress));

        // --- JS Animation Logic ---
        let scale = 0.35; // Default

        if (this.state.currentPhase === 0) { // Inhale: 0.35 -> 1.0
            scale = 0.35 + (0.65 * this.easeInOut(t));
        } else if (this.state.currentPhase === 2) { // Exhale: 1.0 -> 0.35
            scale = 1.0 - (0.65 * this.easeInOut(t));
        } else if (this.state.currentPhase === 1) { // Hold (Full): Pulse at 1.0
            // Gentle pulse between 1.0 and 1.02
            scale = 1.0 + (0.02 * Math.sin(elapsed * 2.5));
        } else if (this.state.currentPhase === 3) { // Hold (Empty): Pulse at 0.35
            // Gentle pulse between 0.35 and 0.37
            scale = 0.35 + (0.01 * Math.sin(elapsed * 2.5));
        }

        this.dom.circle.style.transform = `scale(${scale}) translateZ(0)`;
        // --------------------------

        const cycleProgress = (this.state.currentPhase + phaseProgress) / this.config.phases.length;
        const offset = this.config.circleCircumference * (1 - cycleProgress);

        this.dom.progressCircle.style.strokeDashoffset = offset.toString();

        // Session Timer Countdown Update
        if (this.state.sessionEndTime) {
            const now = performance.now();
            const sessionRemaining = Math.max(0, Math.ceil((this.state.sessionEndTime - now) / 1000));

            if (sessionRemaining <= 0) {
                this.stop();
                return;
            }
            // Only update display numbers
            this.updateSessionDisplay();
        }
    }

    animateText(newText: string) {
        const el = this.dom.phaseText;
        el.classList.add("text-fade-out");
        setTimeout(() => {
            el.textContent = newText;
            el.classList.remove("text-fade-out");
            el.classList.add("text-fade-in");
            setTimeout(() => el.classList.remove("text-fade-in"), 500);
        }, 250);
    }

    async playPhaseSound() {
        if (!this.audioContext || this.state.isMuted) return;

        // Ensure context is running (browser policy fix)
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        // Very subtle sine wave beep
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        // Frequency based on config
        oscillator.frequency.value = this.config.frequencies[this.state.currentPhase];
        oscillator.type = 'sine'; // Pure sine

        // Gentle envelope - Louder
        gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);

        // Attack - Increased Peak Volume to 0.5 (was 0.3)
        gainNode.gain.linearRampToValueAtTime(0.5, this.audioContext.currentTime + 0.1);
        // Decay
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 3.0);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 2.0);
    }

    async playDeepPush() {
        if (!this.audioContext || this.state.isMuted) return;

        // Ensure context is running
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        // Deep Push (Thump) - Enhanced for AirPods/Mobile
        // Kick drum style: Frequency sweep for "impact"
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        const now = this.audioContext.currentTime;

        // Frequency Sweep (Drop from 150Hz to 50Hz)
        // This makes it audible as a "thump" rather than just a low rumble
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);

        // Envelope (Punchy)
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.8, now + 0.02); // Louder start
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.start(now);
        osc.stop(now + 0.5);
    }

    triggerHaptic() {
        const isActivePhase = this.state.currentPhase === 0 || this.state.currentPhase === 2;
        const pattern = isActivePhase ? [60] : [30];

        // Try native vibration first (Android)
        if (navigator.vibrate) {
            navigator.vibrate(pattern);
        }

        // Fallback: iOS / Desktop "Audio Haptic" (Low frequency thump)
        // Note: Logic allows both if supported, but typically mobile chrome supports vibrate. 
        // We can just keep it simple.
        if (!navigator.vibrate && this.audioContext && !this.state.isMuted) {
            this.playHapticSound(isActivePhase);
        }
    }

    playHapticSound(isStrong: boolean) {
        if (!this.audioContext) return;

        // Simulates a "thump" using a low frequency wave
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        osc.frequency.value = 60; // 60Hz is felt more than heard on small speakers

        const now = this.audioContext.currentTime;
        const duration = isStrong ? 0.08 : 0.04;

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1.0, now + 0.01); // Sharp attack
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        osc.start(now);
        osc.stop(now + duration);
    }

    toggleAudio() {
        this.state.isMuted = !this.state.isMuted;
        this.dom.audioBtn.classList.toggle("muted", this.state.isMuted);

        // Update Icon
        const iconPath = this.state.isMuted
            ? "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
            : "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z";

        this.dom.audioBtn.querySelector("path")!.setAttribute("d", iconPath);

        // Init context on unmute if not exists
        if (!this.state.isMuted && !this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (!this.state.isMuted && this.audioContext?.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await (navigator as any).wakeLock.request('screen'); // Typecast for simplicity or add to global
            } catch (err: any) {
                console.log(`${err.name}, ${err.message} `);
            }
        }
    }

    releaseWakeLock() {
        if (this.wakeLock) {
            this.wakeLock.release().then(() => {
                this.wakeLock = null;
            });
        }
    }

    toggleSettings(show: boolean) {
        if (show) {
            this.dom.settingsOverlay.classList.remove("hidden");
        } else {
            this.dom.settingsOverlay.classList.add("hidden");
        }
    }

    // --- Zen Mode Logic (Re-implemented) ---
    initZenModeListener() {
        this.idleTimer = null;

        const reset = () => this.resetIdleTimer();

        // Listen for user activity to reset timer
        ['mousemove', 'mousedown', 'touchstart', 'click', 'keydown'].forEach(evt => {
            document.addEventListener(evt, reset, { passive: true });
        });
    }

    resetIdleTimer() {
        // Always show UI on interaction
        document.body.classList.remove("zen-mode");

        if (this.idleTimer) clearTimeout(this.idleTimer);

        // Only schedule hide if: Running AND Enabled in Settings
        if (this.state.isRunning && this.state.isZenModeEnabled) {
            this.idleTimer = setTimeout(() => {
                document.body.classList.add("zen-mode");
            }, 5000); // 5 seconds of inactivity (User Request)
        }
    }
}

// Initialize App
new BoxBreathingApp();
