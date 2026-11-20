"""Character bounds derived from recognizer CTC positions and detection polygons."""
import numpy as np


def character_boxes(text, polygon, recognition_info):
    columns, groups, group_columns, _ = recognition_info
    aligned = sorted(
        (position, character)
        for group, positions in zip(groups, group_columns)
        for character, position in zip(group, positions)
    )
    if not aligned or columns <= 0:
        return [], []
    polygon = np.asarray(polygon, dtype=float)
    width = np.ptp(polygon[:, 0])
    height = np.ptp(polygon[:, 1])
    if height > width * 1.5:
        # Vertical text requires its own reading direction.
        return [], []
    characters, boxes = [], []
    for index, (position, character) in enumerate(aligned):
        left = (aligned[index - 1][0] + position) / 2 if index else max(0, position - 1)
        right = (position + aligned[index + 1][0]) / 2 if index + 1 < len(aligned) else min(columns, position + 2)
        a, b = max(0, left / columns), min(1, right / columns)
        top_left = polygon[0] + (polygon[1] - polygon[0]) * a
        top_right = polygon[0] + (polygon[1] - polygon[0]) * b
        bottom_left = polygon[3] + (polygon[2] - polygon[3]) * a
        bottom_right = polygon[3] + (polygon[2] - polygon[3]) * b
        characters.append(character)
        boxes.append([top_left.tolist(), top_right.tolist(),
                      bottom_right.tolist(), bottom_left.tolist()])
    return characters, boxes
