// Largest face in an image, via Apple Vision (on-device). Prints JSON {x,y,w,h} as fractions, top-left origin; {} if none.
import Foundation
import Vision
import AppKit
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let img = NSImage(contentsOf: url), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print("{}"); exit(0) }
let req = VNDetectFaceRectanglesRequest()
try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
let faces = (req.results ?? []).sorted { $0.boundingBox.width * $0.boundingBox.height > $1.boundingBox.width * $1.boundingBox.height }
guard let f = faces.first?.boundingBox else { print("{}"); exit(0) }
print(String(format: "{\"x\":%.4f,\"y\":%.4f,\"w\":%.4f,\"h\":%.4f,\"n\":%d}", f.minX, 1 - f.maxY, f.width, f.height, faces.count))
