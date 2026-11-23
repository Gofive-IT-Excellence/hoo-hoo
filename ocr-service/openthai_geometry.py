"""Map CTC frame positions to the original image, retaining literal text offsets."""
from difflib import SequenceMatcher
import numpy as np


def character_spans(chars, box, back, text):
    if not chars:
        return []
    raw = "".join(c[0] for c in chars)
    positions = {}
    for block in SequenceMatcher(None, raw, text, autojunk=False).get_matching_blocks():
        for n in range(block.size):
            positions[block.a + n] = block.b + n
    b = np.asarray(box, dtype=float)
    result, offset = [], 0
    for value, x0, x1, confidence in chars:
        a, z = max(0., float(x0)), min(1., float(x1))
        quad = np.array([b[0]+a*(b[1]-b[0]), b[0]+z*(b[1]-b[0]),
                         b[3]+z*(b[2]-b[3]), b[3]+a*(b[2]-b[3])])
        points = np.c_[quad, np.ones(4)] @ np.asarray(back).T
        points = (points[:, :2] / points[:, 2:]).tolist()
        for j, ch in enumerate(value):
            start = positions.get(offset+j)
            if start is not None:
                result.append({"text": ch, "start": start, "end": start+1, "box": points})
        offset += len(value)
    return result
