import AppKit
import Foundation

// One dot geometry generates both the editable SVG and native macOS icon.
let output = CommandLine.arguments[1]
let image = NSImage(size: NSSize(width: 1024, height: 1024))
let dots: [(CGFloat, CGFloat)] = (0..<2).flatMap { row in
    (0..<9).map { column in
        let x = 248.0 + Double(column) * 66.0
        let y = 450.0 - sin(Double(column) * .pi / 4.0) * 82.0 + Double(row) * 158.0
        return (CGFloat(x), CGFloat(y))
    }
}
let circles = dots.map { "  <circle cx=\"\($0.0)\" cy=\"\($0.1)\" r=\"30\"/>" }.joined(separator: "\n")
let svg = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect x="96" y="96" width="832" height="832" rx="196" fill="#1d6bd5"/>
  <g fill="#ffffff">
\(circles)
  </g>
</svg>
"""
try svg.write(to: URL(fileURLWithPath: output).deletingPathExtension().appendingPathExtension("svg"), atomically: true, encoding: .utf8)
image.lockFocus()
NSGraphicsContext.saveGraphicsState()
let transform = NSAffineTransform()
transform.translateX(by: 0, yBy: 1024)
transform.scaleX(by: 1, yBy: -1)
transform.concat()
NSColor(srgbRed: 29 / 255, green: 107 / 255, blue: 213 / 255, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 96, y: 96, width: 832, height: 832), xRadius: 196, yRadius: 196).fill()
NSColor.white.setFill()
for (x, y) in dots { NSBezierPath(ovalIn: NSRect(x: x - 30, y: y - 30, width: 60, height: 60)).fill() }
NSGraphicsContext.restoreGraphicsState()
image.unlockFocus()
let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
