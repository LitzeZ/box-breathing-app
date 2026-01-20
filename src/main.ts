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
    progressCircle: SVGCircleElement;
    sessionTimer: HTMLElement;
    settingsOverlay: HTMLElement;
    settingsBtn: HTMLElement;
    closeSettingsBtn: HTMLElement;
    zenModeToggle: HTMLInputElement;
    sessionTimeDisplay?: HTMLElement;
    streakBadge: HTMLElement;
    streakCount: HTMLElement;
    // New Dynamic Containers
    patternContainer?: HTMLElement;
    soundscapeContainer?: HTMLElement;
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
    streak: number;
    lastVisit: string | null;
    // New State
    currentPresetId: string;
    currentSoundscapeId: string;
}

interface BreathingPattern {
    id: string;
    name: string;
    phases: string[];
    phaseClasses: string[];
    ratios: number[]; // Relative duration of each phase [1, 1, 1, 1] means equal time
}


interface AppConfig {
    presets: BreathingPattern[];
    circleCircumference: number;
    frequencies: number[]; // Base Tones
}

// Fix for Safari webkitAudioContext
declare global {
    interface Window {
        webkitAudioContext: typeof AudioContext;
    }
}

class BoxBreathingApp {
    dom: DOMElements;
    state: AppState;
    config: AppConfig;
    wakeLock: WakeLockSentinel | null;
    audioContext: AudioContext | null;
    soundscapeContext: AudioContext | null; // Dedicated context for background
    soundscapeGain: GainNode | null;
    soundscapeSource: AudioNode | null; // To stop loop

    lastTapTime: number;
    longPressTimer: ReturnType<typeof setTimeout> | null;
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
            settingsOverlay: document.getElementById("settings-overlay")!,
            settingsBtn: document.getElementById("settings-btn")!,
            closeSettingsBtn: document.getElementById("close-settings-btn")!,
            zenModeToggle: document.getElementById("zen-mode-toggle") as HTMLInputElement,
            streakBadge: document.getElementById("streak-badge")!,
            streakCount: document.querySelector(".streak-count") as HTMLElement
        };

        this.state = {
            isRunning: false,
            isMuted: false,
            baseDuration: 6.0, // Default duration set to 6s
            currentPhase: 0,
            phaseStartTime: 0,
            animationFrameId: null,
            sessionMinutes: 15,
            sessionEndTime: null,
            isZenModeEnabled: false,
            streak: 0,
            lastVisit: null,
            currentPresetId: 'box',
            currentSoundscapeId: 'none'
        };

        // Define Presets
        const presets: any[] = [
            {
                id: 'box',
                name: 'Box',
                description: 'Focus & Stress Relief',
                phases: ["Inhale", "Hold", "Exhale", "Hold"],
                phaseClasses: ["inhale", "hold", "exhale", "hold-small"],
                ratios: [1, 1, 1, 1] // Equal duration
            },
            {
                id: 'relax',
                name: 'Relax',
                description: 'Sleep Aid (4-7-8)',
                phases: ["Inhale", "Hold", "Exhale"],
                phaseClasses: ["inhale", "hold", "exhale"],
                ratios: [4, 7, 8] // 4-7-8 Technique
            },
            {
                id: 'calm',
                name: 'Calm',
                description: 'Balance (4-2-4)',
                phases: ["Inhale", "Hold", "Exhale"],
                phaseClasses: ["inhale", "hold", "exhale"],
                ratios: [4, 2, 4] // Coherence 4-2-4
            },
            {
                id: 'simple',
                name: 'Simple',
                description: 'Natural Breathing',
                phases: ["Inhale", "Exhale"],
                phaseClasses: ["inhale", "exhale"],
                ratios: [1, 1] // Balanced 
            }
        ];

        this.config = {
            presets: presets,
            frequencies: [261.63, 392.00, 329.63, 196.00], // C4, G4, E4, G3
            circleCircumference: 283
        };

        this.wakeLock = null;
        this.audioContext = null;
        this.soundscapeContext = null;
        this.soundscapeGain = null;
        this.soundscapeSource = null;
        this.lastTapTime = 0;
        this.longPressTimer = null;
        this.idleTimer = null;

        this.init();
        this.loadStreak();
    }

    init() {
        // Initialize Session Timer HTML
        this.dom.sessionTimer.innerHTML = `
            <span class="timer-control" data-action="decrease">−</span>
            <span id="session-time-display">15:00</span>
            <span class="timer-control" data-action="increase">+</span>
        `;
        this.dom.sessionTimeDisplay = document.getElementById("session-time-display")!;

        // Inject Dynamic Settings UI
        this.injectSettingsUI();

        this.addEventListeners();
        this.updateDisplay();
        this.updateSessionDisplay();
        this.initZenModeListener();
    }

    injectSettingsUI() {
        // Find insertion point - After "Dauer pro Phase" (Duration)
        const durationSetting = this.dom.decreaseBtn.closest('.setting-item');
        if (!durationSetting) return;

        // 1. Pattern Selector
        const patternItem = document.createElement('div');
        patternItem.className = 'setting-item mobile-layout-fix';
        patternItem.innerHTML = `
            <div class="setting-label">
                <span>Pattern</span>
                <button class="icon-btn tiny" id="pattern-info-btn" aria-label="Pattern Info">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                    </svg>
                </button>
            </div>
            <div id="pattern-description" class="pattern-description">
                 Focus & Stress Relief
            </div>
            <div class="segmented-control" id="pattern-selector">
                ${this.config.presets.map(p =>
            `<button class="segmented-btn ${p.id === this.state.currentPresetId ? 'active' : ''}" data-id="${p.id}">${p.name}</button>`
        ).join('')}
            </div>
        `;
        durationSetting.insertAdjacentElement('afterend', patternItem);
        this.dom.patternContainer = patternItem.querySelector('#pattern-selector') as HTMLElement;

        // 2. Soundscape Selector
        const soundItem = document.createElement('div');
        soundItem.className = 'setting-item mobile-layout-fix';
        soundItem.innerHTML = `
             <div class="setting-label" style="flex: 0 0 100%;">
                <span>Soundscape</span>
                <div class="soundscape-grid" id="soundscape-selector">
                    <button class="sound-btn active" data-id="none">
                        <svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                        <span>Off</span>
                    </button>
                    <button class="sound-btn" data-id="rain">
                        <svg viewBox="0 0 24 24"><path d="M4.03 12c.73-3.04 3.46-5.28 6.72-5.28 2.37 0 4.45 1.18 5.74 2.97.45-.16.91-.25 1.39-.27L17.85 7C17.7 5.09 16.36 3.46 14.59 2.76A8 8 0 0 0 4 11.23L4.03 12zM12.92 7.02c-.08-.01-.16-.02-.24-.02-3.1 0-5.63 2.53-5.63 5.63 0 .42.06.82.14 1.21l1.76-1.76c-.05-.33-.09-.67-.09-1.01 0-2.31 1.76-4.2 4.07-4.2.34 0 .68.04 1.01.09l-1.02-1.02v.08zM19 19h-6c-.55 0-1-.45-1-1s.45-1 1-1h6c.55 0 1 .45 1 1s-.45 1-1 1zm-8 0H5c-.55 0-1-.45-1-1s.45-1 1-1h6c.55 0 1 .45 1 1s-.45 1-1 1zm4-4h-6c-.55 0-1-.45-1-1s.45-1 1-1h6c.55 0 1 .45 1 1s-.45 1-1 1zm4-4h-6c-.55 0-1-.45-1-1s.45-1 1-1h6c.55 0 1 .45 1 1s-.45 1-1 1z"/></svg>
                        <span>Rain</span>
                    </button>
                    <button class="sound-btn" data-id="wind">
                        <svg viewBox="0 0 24 24"><path d="M12.65 19.16l-2.77-3.92a2.33 2.33 0 0 0-3.8 0l-2.77 3.92a.5.5 0 0 0 .41.79h8.52a.5.5 0 0 0 .41-.79zm5.32 0l-1.6-2.26-1.6 2.26a.5.5 0 0 0 .41.79h2.38a.5.5 0 0 0 .41-.79zm-7.97-6.32l-1.6-2.26-1.6 2.26a.5.5 0 0 0 .41.79h2.38a.5.5 0 0 0 .41-.79zM17 10l-3.75 5 2.85 3.8-1.6 1.2C12.81 17.75 10 14 10 14l-6 8h22L17 10z" style="display:none;"/><path d="M19.18 10.99c-2.43 0-4.63 1.39-5.75 3.44l-1.46-2.07c1.37-2.58 4.07-4.37 7.21-4.37 1.63 0 3.16.51 4.45 1.38l1.45-2.06A14.9 14.9 0 0 0 19.18 6C13.84 6 9.17 9 6.8 13.52L5.86 12.2c1.78-4 5.75-6.86 10.4-7.14V3l4 4-4 4V9.07c-3.13.25-5.84 2.05-7.33 4.67l-1.46-2.07c1.88-3.05 5.16-5.09 8.91-5.09 1.13 0 2.21.23 3.23.64l1.45-2.06c-1.35-.55-2.8-.87-4.31-.87z"/></svg>
                        <span>Wind</span>
                    </button>
                </div>
            </div>
        `;
        patternItem.insertAdjacentElement('afterend', soundItem);
        this.dom.soundscapeContainer = soundItem.querySelector('#soundscape-selector') as HTMLElement;
    }

    addEventListeners() {
        this.dom.startBtn.addEventListener("click", () => this.toggle());
        this.dom.audioBtn.addEventListener("click", () => this.toggleAudio());
        this.dom.decreaseBtn.addEventListener("click", () => this.changeDuration(-0.5));
        this.dom.increaseBtn.addEventListener("click", () => this.changeDuration(0.5));
        document.addEventListener("keydown", e => e.key === "Enter" && this.dom.startBtn.click());

        // Audio Unlock
        const unlock = async () => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (!this.soundscapeContext) {
                this.soundscapeContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            if (this.audioContext.state === 'suspended') await this.audioContext.resume();
            if (this.soundscapeContext.state === 'suspended') await this.soundscapeContext.resume();

            // Silent Start
            const buffer = this.audioContext.createBuffer(1, 1, 22050);
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.start(0);

            document.body.removeEventListener('touchstart', unlock);
            document.body.removeEventListener('click', unlock);
        };
        document.body.addEventListener('touchstart', unlock, { once: true });
        document.body.addEventListener('click', unlock, { once: true });
        document.body.addEventListener('keydown', unlock, { once: true });

        // Timer Controls
        this.dom.sessionTimer.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (target.dataset.action === "decrease") this.adjustSessionTime(-5);
            if (target.dataset.action === "increase") this.adjustSessionTime(5);
        });

        // Settings Toggles
        this.dom.settingsBtn.addEventListener("click", () => this.toggleSettings(true));
        this.dom.closeSettingsBtn.addEventListener("click", () => this.toggleSettings(false));
        this.dom.settingsOverlay.addEventListener("click", (e) => {
            if (e.target === this.dom.settingsOverlay) this.toggleSettings(false);
        });

        this.dom.zenModeToggle.addEventListener("change", (e) => {
            const target = e.target as HTMLInputElement;
            this.state.isZenModeEnabled = target.checked;
            this.resetIdleTimer();
        });

        // New: Pattern Selection
        this.dom.patternContainer?.addEventListener('click', (e) => {
            const target = (e.target as HTMLElement).closest('.segmented-btn') as HTMLElement;
            if (!target) return;

            // UI Update
            this.dom.patternContainer!.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
            target.classList.add('active');

            // Logic Update
            this.setPreset(target.dataset.id!);

            // Description Update
            const preset = this.config.presets.find(p => p.id === target.dataset.id);
            const patternsContainer = this.dom.patternContainer!.parentElement!;
            const descEl = patternsContainer.querySelector('#pattern-description');
            if (descEl && preset) descEl.textContent = (preset as any).description;
        });

        // Toggle Description Visibility
        // Locate elements via DOM as they were injected dynamically in a previous method
        // Wrapper is parent of patternContainer
        const patternsWrapper = this.dom.patternContainer?.parentElement;
        if (patternsWrapper) {
            const infoBtn = patternsWrapper.querySelector('#pattern-info-btn');
            const descEl = patternsWrapper.querySelector('#pattern-description');
            infoBtn?.addEventListener('click', () => {
                descEl?.classList.toggle('visible');
            });
        }

        // New: Soundscape Selection
        this.dom.soundscapeContainer?.addEventListener('click', (e) => {
            const target = (e.target as HTMLElement).closest('.sound-btn') as HTMLElement;
            if (!target) return;

            this.dom.soundscapeContainer!.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
            target.classList.add('active');

            this.setSoundscape(target.dataset.id!);
        });

        // Misc
        this.dom.circle.addEventListener("dblclick", () => this.startSession(15));
        this.addLongPressListener(this.dom.circle, () => this.startSession(15));
        this.dom.circle.addEventListener("touchstart", (e) => {
            const currentTime = new Date().getTime();
            if ((currentTime - this.lastTapTime) < 300) {
                this.startSession(15);
                e.preventDefault();
            }
            this.lastTapTime = currentTime;
        });
    }

    setPreset(id: string) {
        this.state.currentPresetId = id;
        // Reset Phase
        if (this.state.isRunning) {
            this.stop(); // Simpler to stop and reset than to hotswap mid-cycle
            this.updateDisplay(); // Reset duration display if needed (though global duration stays same)
        }
    }

    setSoundscape(id: string) {
        this.state.currentSoundscapeId = id;
        if (this.state.isRunning && !this.state.isMuted) {
            this.playBackgroundSound(); // Hotswap
        }
    }

    // ... [Existing Methods: addLongPressListener, adjustSessionTime, updateSessionDisplay, startSession, changeDuration, updateDisplay, toggle] ...

    addLongPressListener(element: HTMLElement, callback: () => void) {
        // [Existing implementation]
        const start = () => {
            this.longPressTimer = setTimeout(() => {
                callback();
                this.triggerHaptic();
            }, 1500);
        };
        const cancel = () => {
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
        };
        element.addEventListener("touchstart", start, { passive: true });
        element.addEventListener("touchend", cancel);
        element.addEventListener("touchmove", cancel);
        element.addEventListener("mousedown", start);
        element.addEventListener("mouseup", cancel);
        element.addEventListener("mouseleave", cancel);
    }

    adjustSessionTime(deltaMinutes: number) {
        // [Existing]
        this.state.sessionMinutes += deltaMinutes;
        if (this.state.sessionMinutes < 1) this.state.sessionMinutes = 1;
        if (this.state.isRunning && this.state.sessionEndTime) {
            this.state.sessionEndTime += deltaMinutes * 60 * 1000;
            const now = performance.now();
            if (this.state.sessionEndTime < now + 10000) this.state.sessionEndTime = now + 10000;
        }
        this.updateSessionDisplay();
        this.triggerHaptic();
    }

    updateSessionDisplay() {
        // [Existing]
        let displayMinutes = this.state.sessionMinutes;
        let displaySeconds = 0;
        if (this.state.isRunning && this.state.sessionEndTime) {
            const now = performance.now();
            const remaining = Math.max(0, Math.ceil((this.state.sessionEndTime - now) / 1000));
            displayMinutes = Math.floor(remaining / 60);
            displaySeconds = remaining % 60;
        }
        const timeString = `${displayMinutes}:${displaySeconds.toString().padStart(2, '0')} `;
        if (this.dom.sessionTimeDisplay) this.dom.sessionTimeDisplay.textContent = timeString;
    }

    startSession(minutes: number) {
        this.state.sessionMinutes = minutes;
        this.updateSessionDisplay();
        this.start();
    }

    changeDuration(delta: number) {
        const oldValue = this.state.baseDuration;
        let newValue = oldValue + delta;
        newValue = Math.max(3, Math.min(30, newValue));
        if (newValue === oldValue) return;
        this.state.baseDuration = newValue;
        this.updateDisplay();
        if (this.state.isRunning) {
            const now = performance.now();
            const elapsed = (now - this.state.phaseStartTime) / 1000;
            const progress = elapsed / oldValue;
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
        const now = performance.now();
        this.state.sessionEndTime = now + (this.state.sessionMinutes * 60 * 1000);
        this.updateSessionDisplay();

        this.dom.startBtn.textContent = "Stop";
        this.dom.startBtn.classList.add("stop");
        this.dom.circle.style.transform = "scale(0.35)";

        // Audio Context Init
        if (!this.audioContext) this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (this.audioContext.state === 'suspended') await this.audioContext.resume();

        if (!this.soundscapeContext) this.soundscapeContext = new (window.AudioContext || window.webkitAudioContext)();
        if (this.soundscapeContext.state === 'suspended') await this.soundscapeContext.resume();

        await this.requestWakeLock();
        this.startBreathing();
        this.playBackgroundSound(); // Start Ambience
        this.resetIdleTimer();
    }

    stop() {
        this.state.isRunning = false;
        if (this.state.animationFrameId !== null) cancelAnimationFrame(this.state.animationFrameId);

        this.dom.startBtn.textContent = "Start";
        this.dom.startBtn.classList.remove("stop");
        this.dom.circle.className = "circle stopped";
        this.dom.circle.style.removeProperty("--scale");

        this.state.sessionEndTime = null;
        this.updateSessionDisplay();

        this.animateText("Box Breathing");
        this.dom.countdown.textContent = "";
        this.dom.progressCircle.style.strokeDashoffset = this.config.circleCircumference.toString(); // Reset Ring

        this.stopBackgroundSound();
        this.releaseWakeLock();
    }

    startBreathing() {
        this.state.phaseStartTime = performance.now();
        this.state.currentPhase = -1;
        this.nextPhase();
        this.loop();
    }

    loop() {
        if (!this.state.isRunning) return;
        const now = performance.now();
        const elapsed = (now - this.state.phaseStartTime) / 1000;

        // Check if phase is complete
        const preset = this.config.presets.find(p => p.id === this.state.currentPresetId)!;
        const currentRatio = preset.ratios[this.state.currentPhase];
        // Ensure baseDuration applies to ratio 1. So if ratio is 4, duration is baseDuration * 4 (if base is 1s "unit")
        // OR: User sets "Duration per Phase" (defaults 6s). 
        // Interpretation: "Duration per Phase" usually implies the average or the '1' unit.
        // Let's assume user setting (e.g. 4s) is the '1' unit.
        // So 4-7-8 would be: Inhale 4s, Hold 7s, Exhale 8s IF ratios are 1-1.75-2?
        // NO. The standard is "4-7-8 seconds". Box is "4-4-4-4 seconds".
        // The User setting is "Duration per Phase". In Box breathing, this is 4s (or 6s default).
        // For 4-7-8, the setting is less clear.
        // Let's interpret baseDuration as the "Inhale" duration (Ratio 4).
        // Then normalize ratios relative to the first phase (Inhale).
        // Actually, simplest UX: baseDuration = length of the '1' ratio unit? 
        // No, user sees "6.0s". If they switch to Relax (4-7-8), 6s Inhale (4 units) -> Hold 10.5s -> Exhale 12s? 
        // Let's treat baseDuration as the duration of the current phase if ratios were equal.
        // Better: Treat baseDuration as the duration of the 1st phase (Inhale) and scale others.
        // REVISION: The `ratios` array in presets (e.g., [4, 7, 8]) represents relative time.
        // If user sets "4.0s", that should map to the "4" in "4-7-8"? 
        // Yes. So unit = baseDuration / ratio[0].

        const unitDuration = this.state.baseDuration / preset.ratios[0];
        const phaseDuration = unitDuration * currentRatio;

        if (elapsed >= phaseDuration) {
            this.nextPhase();
        } else {
            this.updateUI(elapsed, phaseDuration);
        }
        this.state.animationFrameId = requestAnimationFrame(() => this.loop());
    }


    nextPhase() {
        const preset = this.config.presets.find(p => p.id === this.state.currentPresetId)!;
        this.state.currentPhase = (this.state.currentPhase + 1) % preset.phases.length;
        this.state.phaseStartTime = performance.now();

        // UI Updates
        const currentClass = preset.phaseClasses[this.state.currentPhase];
        this.dom.circle.className = `circle ${currentClass} `;
        this.dom.circle.style.setProperty("--dur", `${this.state.baseDuration}s`);
        this.dom.circle.style.removeProperty("--scale");

        this.animateText(preset.phases[this.state.currentPhase]);

        try {
            this.playPhaseSound(this.state.currentPhase);
            if (this.state.currentPhase === 0 || this.state.currentPhase === 2) {
                this.playDeepPush(); // Pulse on Inhale/Exhale start for rhythm
            }
            this.triggerHaptic();
        } catch (e) { console.warn("Audio feedback error:", e); }
    }

    updateUI(elapsed: number, phaseDuration: number) {
        const remaining = Math.max(0, phaseDuration - elapsed);
        this.dom.countdown.textContent = Math.ceil(remaining).toString() || "";

        const phaseProgress = elapsed / phaseDuration;
        const t = Math.max(0, Math.min(1, phaseProgress));

        // Animation Logic based on Preset
        const preset = this.config.presets.find(p => p.id === this.state.currentPresetId)!;
        const phaseName = preset.phases[this.state.currentPhase];
        let scale = 0.35;

        // Generalizing logic based on phase name string
        if (phaseName === "Inhale") {
            scale = 0.35 + (0.65 * this.easeInOut(t));
        } else if (phaseName === "Exhale") {
            scale = 1.0 - (0.65 * this.easeInOut(t));
        } else if (phaseName === "Hold") {
            // Check previous phase to decide if holding Full or Empty
            // Quick hack: if current index is odd in Box breathing (1 or 3)
            const prevPhaseIndex = (this.state.currentPhase - 1 + preset.phases.length) % preset.phases.length;
            const prevPhaseName = preset.phases[prevPhaseIndex];

            if (prevPhaseName === "Inhale") {
                // Hold Full
                scale = 1.0 + (0.02 * Math.sin(elapsed * 2.5));
            } else {
                // Hold Empty
                scale = 0.35 + (0.01 * Math.sin(elapsed * 2.5));
            }
        }

        this.dom.circle.style.transform = `scale(${scale}) translateZ(0)`;

        // Progress Ring Calculation
        // Calculate total cycle duration based on ratios
        const unitDuration = this.state.baseDuration / preset.ratios[0];
        const totalDuration = preset.ratios.reduce((a, b) => a + b, 0) * unitDuration;

        // Calculate accumulated time for previous phases
        let timePrior = 0;
        for (let i = 0; i < this.state.currentPhase; i++) {
            timePrior += preset.ratios[i] * unitDuration;
        }

        const cycleProgressTime = timePrior + elapsed;
        const cycleProgress = cycleProgressTime / totalDuration;

        const offset = this.config.circleCircumference * (1 - cycleProgress);
        this.dom.progressCircle.style.strokeDashoffset = offset.toString();

        // Session Timer
        if (this.state.sessionEndTime) {
            const now = performance.now();
            const sessionRemaining = Math.max(0, Math.ceil((this.state.sessionEndTime - now) / 1000));
            if (sessionRemaining <= 0) {
                this.updateStreak();
                this.playGong(); // END OF SESSION SOUND
                this.stop();
                return;
            }
            this.updateSessionDisplay();
        }
    }

    playGong() {
        if (!this.audioContext || this.state.isMuted) return;
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;

        // Complex Gong Synthesis (Fundamental + Harmonics)
        const freqs = [180, 240, 320, 560];
        const gains = [0.4, 0.3, 0.2, 0.1];
        const decays = [3.0, 2.5, 2.0, 4.0];

        freqs.forEach((f, i) => {
            const osc = this.audioContext!.createOscillator();
            const gain = this.audioContext!.createGain();

            osc.frequency.value = f;
            osc.type = i === 0 ? 'triangle' : 'sine'; // Fundamental has more body

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(gains[i], now + 0.05); // Attack
            gain.gain.exponentialRampToValueAtTime(0.001, now + decays[i]); // Decay

            osc.connect(gain);
            gain.connect(this.audioContext!.destination);

            osc.start(now);
            osc.stop(now + decays[i] + 0.1);
        });
    }

    playPhaseSound(phaseIndex: number) {
        if (!this.audioContext || this.state.isMuted) return;
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        // Reverted to steady tones based on user feedback
        const now = this.audioContext.currentTime;
        const preset = this.config.presets.find(p => p.id === this.state.currentPresetId)!;
        const phaseName = preset.phases[phaseIndex];

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

        oscillator.type = 'sine';

        if (phaseName === "Inhale") {
            oscillator.frequency.value = 174.61; // F3
        } else if (phaseName === "Exhale") {
            oscillator.frequency.value = 130.81; // C3
        } else {
            // Hold
            oscillator.frequency.value = 146.83; // D3
        }

        oscillator.start(now);
        oscillator.stop(now + 1.5);
    }

    // --- Soundscape Generation (Pink/Brown Noise) ---
    playBackgroundSound() {
        this.stopBackgroundSound(); // Clear previous
        if (this.state.currentSoundscapeId === 'none' || !this.soundscapeContext || this.state.isMuted) return;
        if (this.soundscapeContext.state === 'suspended') this.soundscapeContext.resume();

        const ctx = this.soundscapeContext;
        this.soundscapeGain = ctx.createGain();
        this.soundscapeGain.connect(ctx.destination);
        this.soundscapeGain.gain.value = 0.05; // Very Subtle Base Volume

        if (this.state.currentSoundscapeId === 'rain') {
            this.createPinkNoise(ctx, this.soundscapeGain);
        } else if (this.state.currentSoundscapeId === 'wind') {
            this.createForestWind(ctx, this.soundscapeGain);
        }
    }

    stopBackgroundSound() {
        if (this.soundscapeGain) {
            const now = this.soundscapeContext?.currentTime || 0;
            this.soundscapeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
            setTimeout(() => {
                this.soundscapeSource?.disconnect();
                this.soundscapeSource = null;
                this.soundscapeGain = null;
            }, 600);
        }
    }

    createPinkNoise(ctx: AudioContext, output: GainNode) {
        // Pink Noise approx for Rain
        const bufferSize = 2 * ctx.sampleRate;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        let b0, b1, b2, b3, b4, b5, b6;
        b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            data[i] *= 0.11;
            b6 = white * 0.115926;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        // Filter to make it sound more like rain vs static
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800; // Muffled rain

        noise.connect(filter);
        filter.connect(output);
        noise.start(0);
        this.soundscapeSource = noise;
    }

    createBrownNoise(ctx: AudioContext, output: GainNode) {
        // Brown Noise for Beach/Ocean
        const bufferSize = 2 * ctx.sampleRate;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0;

        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            data[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = data[i];
            data[i] *= 3.5; // Compensate for gain loss
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        // Modulate volume to simulate waves
        const waveLFO = ctx.createOscillator();
        waveLFO.type = 'sine';
        waveLFO.frequency.value = 0.1; // 10 seconds per wave approx
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.3; // Modulation depth

        const mainFilter = ctx.createBiquadFilter();
        mainFilter.type = 'lowpass';
        mainFilter.frequency.value = 400; // Deep rumble

        noise.connect(mainFilter);
        mainFilter.connect(output);

        // This is a simplified modulation; true ocean need complex envelopes but this is a good start
        // Actually, let's keep it steady for now to act as "Noise" option rather than distracting wave
        // Just connecting directly.

        noise.start(0);
        this.soundscapeSource = noise;
    }

    createForestWind(ctx: AudioContext, output: GainNode) {
        // Brown Noise for Wind
        const bufferSize = 2 * ctx.sampleRate;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0;

        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            data[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = data[i];
            data[i] *= 3.5;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        // Modulate volume for gusty wind effect
        const waveLFO = ctx.createOscillator();
        waveLFO.type = 'sine';
        waveLFO.frequency.value = 0.05; // 20 seconds, very slow for wind

        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.4; // Depth of gusts

        // Connect: LFO -> ModGain -> MainGain.gain
        waveLFO.connect(lfoGain);
        lfoGain.connect(output.gain);

        // Filter: Highpass to remove rumbles (leaves rustling)
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 200;

        noise.connect(filter);
        filter.connect(output);

        noise.start(0);
        waveLFO.start(0);

        this.soundscapeSource = noise;
    }

    toggleAudio() {
        this.state.isMuted = !this.state.isMuted;
        this.dom.audioBtn.classList.toggle("muted", this.state.isMuted);

        const iconPath = this.state.isMuted
            ? "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
            : "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z";
        this.dom.audioBtn.querySelector("path")!.setAttribute("d", iconPath);

        if (!this.state.isMuted) {
            this.playBackgroundSound(); // Resume ambience if enabled
        } else {
            this.stopBackgroundSound();
        }
    }

    // ... [Rest of Helper Methods: playDeepPush, triggerHaptic, playHapticSound, requestWakeLock, releaseWakeLock, toggleSettings, initZenModeListener, resetIdleTimer, animateText, easeInOut, loadStreak, updateStreak, updateStreakDisplay] ... 

    playDeepPush() {
        if (!this.audioContext || this.state.isMuted) return;
        if (this.audioContext.state === 'suspended') this.audioContext.resume();
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        oscillator.connect(gain);
        gain.connect(this.audioContext.destination);
        const now = this.audioContext.currentTime;
        oscillator.frequency.setValueAtTime(150, now);
        oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.15);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.8, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        oscillator.start(now);
        oscillator.stop(now + 0.5);
    }

    triggerHaptic() {
        const isActivePhase = this.state.currentPhase === 0 || this.state.currentPhase === 2; // Inhale or Exhale are active
        // Correction: In Box (0,1,2,3), 0 and 2 are active. In Simple (0,1), 0 and 1 are active.
        // Better logic: Always buzz on transition
        const pattern = [30];
        if (navigator.vibrate) navigator.vibrate(pattern);
        if (!navigator.vibrate && this.audioContext && !this.state.isMuted) this.playHapticSound(isActivePhase);
    }

    playHapticSound(isStrong: boolean) {
        if (!this.audioContext) return;
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        oscillator.connect(gain);
        gain.connect(this.audioContext.destination);
        oscillator.frequency.value = 60;
        const now = this.audioContext.currentTime;
        const duration = isStrong ? 0.08 : 0.04;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1.0, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
        oscillator.start(now);
        oscillator.stop(now + duration);
    }

    requestWakeLock() { if ('wakeLock' in navigator) { try { (navigator as any).wakeLock.request('screen'); } catch (e) { } } }
    releaseWakeLock() { if (this.wakeLock) this.wakeLock.release(); }
    toggleSettings(show: boolean) {
        if (show) this.dom.settingsOverlay.classList.remove("hidden");
        else this.dom.settingsOverlay.classList.add("hidden");
    }
    initZenModeListener() {
        this.idleTimer = null; const reset = () => this.resetIdleTimer();
        ['mousemove', 'mousedown', 'touchstart', 'click', 'keydown'].forEach(evt => document.addEventListener(evt, reset, { passive: true }));
    }
    resetIdleTimer() {
        document.body.classList.remove("zen-mode");
        if (this.idleTimer) clearTimeout(this.idleTimer);
        if (this.state.isRunning && this.state.isZenModeEnabled) {
            this.idleTimer = setTimeout(() => { document.body.classList.add("zen-mode"); }, 5000);
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
    easeInOut(t: number) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    loadStreak() {
        const s = localStorage.getItem("boxBreathingStreak");
        const v = localStorage.getItem("boxBreathingLastVisit");
        if (s) this.state.streak = parseInt(s, 10);
        if (v) this.state.lastVisit = v;
        this.updateStreakDisplay();
    }
    updateStreak() {
        const today = new Date().toDateString();
        if (this.state.lastVisit !== today) {
            const y = new Date(); y.setDate(y.getDate() - 1);
            if (this.state.lastVisit === y.toDateString()) this.state.streak++;
            else this.state.streak = 1;
            this.state.lastVisit = today;
            localStorage.setItem("boxBreathingStreak", this.state.streak.toString());
            localStorage.setItem("boxBreathingLastVisit", this.state.lastVisit);
            this.updateStreakDisplay();
        }
    }
    updateStreakDisplay() {
        if (this.state.streak > 0) {
            this.dom.streakBadge.classList.remove("hidden");
            this.dom.streakCount.textContent = this.state.streak.toString();
        } else this.dom.streakBadge.classList.add("hidden");
    }
}

new BoxBreathingApp();
