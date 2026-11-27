import QuickLookUI
import UniformTypeIdentifiers
import os

final class PreviewProvider: QLPreviewProvider, QLPreviewingController {
    func providePreview(for request: QLFilePreviewRequest) async throws -> QLPreviewReply {
        guard let renderer = Bundle(for: Self.self).url(forResource: "preview", withExtension: "js") else {
            throw DiagramError(message: "Missing diagram renderer.")
        }
        let html = try DiagramHTML.make(for: request.fileURL, renderer: renderer)
        Logger(subsystem: "kr.ac.kookmin.fmcl.SLXPreview", category: "render").info("Prepared SLX preview, \(html.count) bytes")
        return QLPreviewReply(dataOfContentType: .html, contentSize: CGSize(width: 1040, height: 720)) { reply in
            reply.stringEncoding = .utf8
            return html
        }
    }
}
