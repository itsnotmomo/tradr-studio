// Lifts the subject (person/people) out of a photo with Apple's on-device Vision model and writes a
// transparent PNG the same size as the input. Nothing is generated: pixels are the original photo's.
// Usage: swift scripts/news/cutout.swift <in.jpg> <out.png>
import AppKit
import CoreImage
import Vision

let args = CommandLine.arguments
guard args.count == 3 else { fputs("usage: cutout <in> <out.png>\n", stderr); exit(2) }
let inURL = URL(fileURLWithPath: args[1]), outURL = URL(fileURLWithPath: args[2])

guard let ci = CIImage(contentsOf: inURL, options: [.applyOrientationProperty: true]) else {
  fputs("can't read \(args[1])\n", stderr); exit(1)
}
let handler = VNImageRequestHandler(ciImage: ci)
let req = VNGenerateForegroundInstanceMaskRequest()
do { try handler.perform([req]) } catch { fputs("vision failed: \(error)\n", stderr); exit(1) }
guard let obs = req.results?.first, !obs.allInstances.isEmpty else { fputs("no subject found\n", stderr); exit(3) }

do {
  let buf = try obs.generateMaskedImage(ofInstances: obs.allInstances, from: handler, croppedToInstancesExtent: true)
  let masked = CIImage(cvPixelBuffer: buf)
  let ctx = CIContext()
  guard let cs = CGColorSpace(name: CGColorSpace.sRGB) else { exit(1) }
  try ctx.writePNGRepresentation(of: masked, to: outURL, format: .RGBA8, colorSpace: cs)
  print("ok \(Int(masked.extent.width))x\(Int(masked.extent.height)) instances=\(obs.allInstances.count)")
} catch { fputs("mask failed: \(error)\n", stderr); exit(1) }
