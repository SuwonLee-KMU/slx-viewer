import SwiftUI
@main
struct SLXPreviewApp: App {
    var body: some Scene {
        WindowGroup("SLX Preview") {
            VStack(alignment: .leading, spacing: 10) {
                Text("Simulink Quick Look").font(.title2)
                Text("Select an .slx file in Finder and press the space bar to see its block diagrams.")
            }
            .padding(24).frame(width: 380)
        }
        .windowResizability(.contentSize)
    }
}
