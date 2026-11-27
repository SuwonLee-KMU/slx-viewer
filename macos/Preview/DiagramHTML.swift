import Foundation
import JavaScriptCore

struct DiagramError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

enum DiagramHTML {
    static func make(for url: URL, renderer: URL) throws -> Data {
        let limit = 64 * 1024 * 1024
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        guard let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= limit,
              let data = try handle.read(upToCount: limit + 1), !data.isEmpty, data.count <= limit else {
            throw DiagramError(message: "Expected a nonempty SLX file of at most 64 MiB.")
        }
        guard let context = JSContext() else { throw DiagramError(message: "Could not start the diagram renderer.") }
        context.evaluateScript(try String(contentsOf: renderer, encoding: .utf8))
        if let error = context.exception { throw DiagramError(message: error.toString()) }
        let ref = context.jsGlobalContextRef
        guard let array = JSObjectMakeTypedArray(ref, kJSTypedArrayTypeUint8Array, data.count, nil),
              let buffer = JSObjectGetTypedArrayBytesPtr(ref, array, nil) else {
            throw DiagramError(message: "Could not allocate a buffer for this file.")
        }
        data.copyBytes(to: buffer.assumingMemoryBound(to: UInt8.self), count: data.count)
        let bytes = JSValue(jsValueRef: array, in: context)!
        let viewer = context.objectForKeyedSubscript("SLXViewer")
        let result = viewer?.invokeMethod("render", withArguments: [bytes, url.lastPathComponent])
        if let error = context.exception { throw DiagramError(message: error.toString()) }
        guard let result, result.isString, let html = result.toString() else {
            throw DiagramError(message: "Could not render the model.")
        }
        return Data(html.utf8)
    }
}
