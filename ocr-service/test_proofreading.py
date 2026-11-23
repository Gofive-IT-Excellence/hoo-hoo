import io
import json
import os
import unittest
from unittest.mock import patch

from proofreading import proofread, validate_lines, validate_result


class ProofreadingTests(unittest.TestCase):
    def test_missing_and_duplicate_ids_are_not_checked(self):
        lines = [{'id': 4, 'text': 'ตัวอย่าง'}, {'id': 9, 'text': 'ข้อมูล'}]
        result = validate_result({'lines': [{'id': 4, 'corrections': []},
                                          {'id': 4, 'corrections': []}]}, lines)
        self.assertEqual(result, {'lines': [], 'unchecked': [4, 9]})

    def test_unsupported_word_does_not_certify_a_line(self):
        result = validate_result({'lines': [{'id': 0, 'corrections': [
            {'wrong': 'ไม่มีในต้นฉบับ', 'correct': 'ใหม่'}]}]}, [{'id': 0, 'text': 'ข้อมูล'}])
        self.assertEqual(result['unchecked'], [0])

    def test_valid_empty_corrections_certify_only_the_returned_line(self):
        self.assertEqual(validate_result({'lines': [{'id': 3, 'corrections': []}]},
                                         [{'id': 3, 'text': 'ข้อความถูก'}])['unchecked'], [])

    def test_correct_function_words_are_not_replaced(self):
        for wrong, correct, text in [
            ('ที่', 'ล่ะ', 'ข้อมูลส่วนบุคคลที่เก็บรวบรวม'),
            ('ข้อมูลที่เก็บ', 'ข้อมูลล่ะเก็บ', 'ข้อมูลที่เก็บ'),
            ('และ', 'หรือ', 'ข้อมูลและเอกสาร'),
        ]:
            result = validate_result({'lines': [{'id': 0, 'corrections': [
                {'wrong': wrong, 'correct': correct}]}]}, [{'id': 0, 'text': text}])
            self.assertEqual(result['lines'][0]['corrections'], [])
            self.assertEqual(result['unchecked'], [])

    def test_real_spelling_error_in_function_word_is_retained(self):
        result = validate_result({'lines': [{'id': 0, 'corrections': [
            {'wrong': 'ไห้', 'correct': 'ให้'}]}]}, [{'id': 0, 'text': 'ไห้ข้อมูล'}])
        self.assertEqual(result['lines'][0]['corrections'], [{'wrong': 'ไห้', 'correct': 'ให้'}])

    def test_existing_tone_mark_is_not_treated_as_missing(self):
        result = validate_result({'lines': [{'id': 0, 'corrections': [
            {'wrong': 'ได', 'correct': 'ได้'}]}]}, [{'id': 0, 'text': 'ได้เลย'}])
        self.assertEqual(result['lines'][0]['corrections'], [])

    def test_missing_tone_mark_can_still_be_corrected(self):
        result = validate_result({'lines': [{'id': 0, 'corrections': [
            {'wrong': 'ได', 'correct': 'ได้'}]}]}, [{'id': 0, 'text': 'ไดเลย'}])
        self.assertEqual(len(result['lines'][0]['corrections']), 1)

    def test_meaning_changes_are_unchecked_and_spacing_is_not_a_typo(self):
        lines = [{'id': 0, 'text': 'สินค้าผ่านมาตรฐนการตรวจสอบแล้ว'}]
        result = validate_result({'lines': [{'id': 0, 'corrections': [
            {'wrong': 'มาตรฐน', 'correct': 'มาตรการ'}]}]}, lines)
        self.assertEqual(result['unchecked'], [0])
        result = validate_result({'lines': [{'id': 0, 'corrections': [
            {'wrong': 'ได้ สินเชื่อ', 'correct': 'ได้สินเชื่อ'}]}]}, [{'id': 0, 'text': 'ได้ สินเชื่อ'}])
        self.assertEqual(result['lines'][0]['corrections'], [])

    def test_suggestion_that_introduces_a_repeated_word_is_unchecked(self):
        result = validate_result({'lines': [{'id': 0, 'corrections': [
            {'wrong': 'กาน', 'correct': 'ก่อน'}]}]},
            [{'id': 0, 'text': 'กรุณาตรวจสอบกำหนดกานก่อนเข้าร่วมงาน'}])
        self.assertEqual(result['unchecked'], [0])

    def test_conservative_glyph_edits_keep_thai_karan_and_reject_rewrites(self):
        result = validate_result({'lines': [{'id': 0, 'corrections': [
            {'wrong': 'ประชาสัมพัน', 'correct': 'ประชาสัมพันธ์'}]}]},
            [{'id': 0, 'text': 'เจ้าหน้าที่ประชาสัมพัน'}])
        self.assertEqual(len(result['lines'][0]['corrections']), 1)
        result = validate_result({'lines': [{'id': 0, 'corrections': [
            {'wrong': 'กาน', 'correct': 'กิจ'}]}]}, [{'id': 0, 'text': 'กำหนดกาน'}])
        self.assertEqual(result['unchecked'], [0])

    def test_invalid_and_oversized_requests(self):
        for rows in [[], [{'id': True, 'text': 'ข้อมูล'}],
                     [{'id': 0, 'text': 'ก' * 10001}],
                     [{'id': i, 'text': 'ข้อมูล'} for i in range(7)]]:
            with self.assertRaises(ValueError):
                validate_lines(rows)

    def test_truncation_is_a_failure_not_a_clean_result(self):
        with patch.dict(os.environ, {'PROOFREAD_API_KEY': 'synthetic-test-key'}):
            with self.assertRaisesRegex(RuntimeError, 'truncated'):
                proofread([{'id': 0, 'text': 'ตัวอย่าง'}], opener=lambda *a, **k: io.StringIO(json.dumps({
                    'choices': [{'finish_reason': 'length', 'message': {'content': '{'}}]})))

    def test_old_gateway_secret_is_ignored_and_document_stays_in_user_message(self):
        def opener(request, **kwargs):
            body = json.loads(request.data)
            self.assertNotIn('synthetic-test-key', request.data.decode())
            self.assertIsNone(request.get_header('Authorization'))
            self.assertEqual(request.full_url, 'http://127.0.0.1:5056/v1/chat/completions')
            self.assertEqual(body['model'], 'qwen3-8b')
            self.assertEqual(body['messages'][1]['role'], 'user')
            return io.StringIO(json.dumps({'choices': [{'finish_reason': 'stop', 'message': {
                'content': json.dumps({'lines': [{'id': 7, 'corrections': []}]})}}]}))
        with patch.dict(os.environ, {'PROOFREAD_API_KEY': 'synthetic-test-key', 'PROOFREAD_API_URL': 'https://external.invalid', 'PROOFREAD_MODEL': 'old-model'}):
            result = proofread([{'id': 7, 'text': 'ข้อความสังเคราะห์'}], opener=opener)
        self.assertEqual(result['unchecked'], [])


if __name__ == '__main__':
    unittest.main()
