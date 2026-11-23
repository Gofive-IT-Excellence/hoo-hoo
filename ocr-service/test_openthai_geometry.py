import unittest
import numpy as np
from openthai_geometry import character_spans

class CharacterCoordinates(unittest.TestCase):
    def test_ctc_positions_follow_original_image_transform(self):
        chars = [('ไ', .1, .2, .99), ('ด', .3, .4, .99), ('้', .4, .45, .99)]
        box = [[0,0],[100,0],[100,20],[0,20]]
        back = [[1,0,50],[0,1,30],[0,0,1]]
        result = character_spans(chars, box, back, 'ได้')
        self.assertEqual([c['text'] for c in result], list('ได้'))
        self.assertEqual([c['start'] for c in result], [0,1,2])
        self.assertEqual(result[0]['box'][0], [60,30])
        self.assertEqual(result[1]['box'][1], [90,30])
    def test_normalization_does_not_invent_character_coordinates(self):
        result = character_spans([('U',0,.4,.9),('า',.4,.6,.9)],
                                 [[0,0],[100,0],[100,20],[0,20]], np.eye(3), 'บา')
        self.assertEqual([c['text'] for c in result], ['า'])
        self.assertEqual(result[0]['start'], 1)
