from PIL import Image, ImageDraw

BG = (21, 25, 30, 255)        # --bg
SAGE = (95, 139, 122, 255)    # --sage
SAGE_BRIGHT = (127, 174, 155, 255)  # --sage-bright
SAGE_DIM = (95, 139, 122, 70)

def make_icon(size, maskable=False, path="icon.png"):
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)

    if maskable:
        # Maskable icons get cropped to a circle/squircle by the OS, so keep
        # the visual content within the safe zone (~80% of the canvas, centered)
        margin = size * 0.20
    else:
        margin = size * 0.14

    cx, cy = size / 2, size / 2
    outer_r = (size / 2) - margin
    inner_r = outer_r * 0.62

    # outer ring (soft sage)
    ring_width = max(2, size * 0.045)
    draw.ellipse(
        [cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r],
        outline=SAGE, width=int(ring_width)
    )

    # inner filled circle (the breathing dot, brighter sage)
    draw.ellipse(
        [cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r],
        fill=SAGE_BRIGHT
    )

    img.save(path, "PNG")
    print(f"saved {path} ({size}x{size}, maskable={maskable})")

make_icon(192, maskable=False, path="icons/icon-192.png")
make_icon(512, maskable=False, path="icons/icon-512.png")
make_icon(192, maskable=True, path="icons/icon-maskable-192.png")
make_icon(512, maskable=True, path="icons/icon-maskable-512.png")
