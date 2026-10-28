"""Predis balance extraction must reject plan sizes and generation prices."""

import unittest

from app.predis_account import _extract_balance, _text_balance


class PredisBalanceTests(unittest.TestCase):
    def test_explicit_remaining_credit_field(self):
        self.assertEqual(_extract_balance({"account": {"remaining_credits": 3155}}), 3155)

    def test_plan_allowance_is_not_a_balance(self):
        self.assertIsNone(_extract_balance({"monthly_credits": 3200, "credit_cost": 15}))

    def test_plain_text_balance_is_explicit(self):
        self.assertEqual(_text_balance("Remaining credits: 3,155"), 3155)
        self.assertIsNone(_text_balance("Your plan includes 3,200 credits"))


if __name__ == "__main__":
    unittest.main()
