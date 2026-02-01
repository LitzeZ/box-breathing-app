import Foundation

/// Represents a specific breathing technique
struct BreathingPattern: Identifiable, Hashable {
    let id: String
    let name: String
    let description: String
    let icon: String // SF Symbol name
    let phases: [String] // e.g. ["Inhale", "Hold", "Exhale", "Hold"]
    let ratios: [Double] // e.g. [1, 1, 1, 1] for Box Breathing
    let phaseClasses: [String] // Maps to logic for animation/haptics: "inhale", "hold", "exhale"
    var isTimerOnly: Bool? = false // Optional flag for "Timer Only" mode without phase cues
    
    // Default Presets (Order: Box, Calm, Relax, Simple, Unwind, Meditation)
    static let allPresets: [BreathingPattern] = [
        // Row 1
        BreathingPattern(
            id: "box",
            name: NSLocalizedString("Box", comment: "Pattern Name"),
            description: NSLocalizedString("Focus & Stress Relief", comment: "Pattern Description"),
            icon: "square",
            phases: [NSLocalizedString("Inhale", comment: "Phase"), NSLocalizedString("Hold", comment: "Phase"), NSLocalizedString("Exhale", comment: "Phase"), NSLocalizedString("Hold", comment: "Phase")],
            ratios: [1, 1, 1, 1],
            phaseClasses: ["inhale", "hold", "exhale", "hold"]
        ),
        BreathingPattern(
            id: "calm",
            name: NSLocalizedString("Calm", comment: "Pattern Name"),
            description: NSLocalizedString("Balance (4-2-4)", comment: "Pattern Description"),
            icon: "leaf.fill",
            phases: [NSLocalizedString("Inhale", comment: "Phase"), NSLocalizedString("Hold", comment: "Phase"), NSLocalizedString("Exhale", comment: "Phase")],
            ratios: [4, 2, 4],
            phaseClasses: ["inhale", "hold", "exhale"]
        ),
        // Row 2
        BreathingPattern(
            id: "relax",
            name: NSLocalizedString("Relax", comment: "Pattern Name"),
            description: NSLocalizedString("Sleep Aid (4-7-8)", comment: "Pattern Description"),
            icon: "moon.fill",
            phases: [NSLocalizedString("Inhale", comment: "Phase"), NSLocalizedString("Hold", comment: "Phase"), NSLocalizedString("Exhale", comment: "Phase")],
            ratios: [4, 7, 8],
            phaseClasses: ["inhale", "hold", "exhale"]
        ),
        BreathingPattern(
            id: "simple",
            name: NSLocalizedString("Simple", comment: "Pattern Name"),
            description: NSLocalizedString("Natural Breathing", comment: "Pattern Description"),
            icon: "wind",
            phases: [NSLocalizedString("Inhale", comment: "Phase"), NSLocalizedString("Exhale", comment: "Phase")],
            ratios: [1, 1],
            phaseClasses: ["inhale", "exhale"]
        ),
        // Row 3 (Unwind & Meditation at bottom right)
        BreathingPattern(
            id: "unwind",
            name: NSLocalizedString("Unwind", comment: "Pattern Name"),
            description: NSLocalizedString("Deep Calm (1:2)", comment: "Pattern Description"),
            icon: "wind.snow",
            phases: [NSLocalizedString("Inhale", comment: "Phase"), NSLocalizedString("Exhale", comment: "Phase")],
            ratios: [1, 2],
            phaseClasses: ["inhale", "exhale"]
        ),
        BreathingPattern(
            id: "zen",
            name: NSLocalizedString("Meditation", comment: "Pattern Name"),
            description: NSLocalizedString("Pure Timer", comment: "Pattern Description"),
            icon: "hourglass",
            phases: [NSLocalizedString("Meditate", comment: "Phase")],
            ratios: [60],
            phaseClasses: ["hold"],
            isTimerOnly: true
        )
    ]
}
