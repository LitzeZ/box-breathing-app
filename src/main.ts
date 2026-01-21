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
    // New Dynamic Containers
    patternContainer?: HTMLElement;
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
    // New State
    currentPresetId: string;
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
            zenModeToggle: document.getElementById("zen-mode-toggle") as HTMLInputElement
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
            currentPresetId: 'box'
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

        this.lastTapTime = 0;
        this.longPressTimer = null;
        this.idleTimer = null;

        this.init();
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
                <span>Pattern Mode</span>
            </div>
            <div class="segmented-control" id="pattern-selector">
                ${this.config.presets.map(p =>
            `<button class="segmented-btn ${p.id === this.state.currentPresetId ? 'active' : ''}" data-id="${p.id}">${p.name}</button>`
        ).join('')}
            </div>
            <div id="pattern-description" class="pattern-description">
                 Focus & Stress Relief
            </div>
        `;
        durationSetting.insertAdjacentElement('afterend', patternItem);
        this.dom.patternContainer = patternItem.querySelector('#pattern-selector') as HTMLElement;
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

            if (this.audioContext.state === 'suspended') await this.audioContext.resume();

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

        await this.requestWakeLock();
        this.startBreathing();
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


    toggleAudio() {
        this.state.isMuted = !this.state.isMuted;
        this.dom.audioBtn.classList.toggle("muted", this.state.isMuted);

        const iconPath = this.state.isMuted
            ? "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
            : "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z";
        this.dom.audioBtn.querySelector("path")!.setAttribute("d", iconPath);
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
}

new BoxBreathingApp();
