"""Usage reporting must keep dollars, credits and generation counts separate."""
import unittest
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.spend_report import read_spend_report


class SpendReportTests(unittest.TestCase):
    def test_aggregates_provider_units_without_inventing_missing_credits(self):
        now = datetime.now(UTC)
        db = MagicMock()
        db.scalars.side_effect = [
            [SimpleNamespace(provider="OpenRouter", created_at=now, amount_usd=Decimal("0.0123"))],
            [SimpleNamespace(provider="Predis", updated_at=now, status="completed", result={}),
             SimpleNamespace(provider="Creatify", updated_at=now, status="completed",
                             result={"credits": 5, "ttsCredits": 2})],
        ]
        with patch("app.spend_report._openrouter_balance", return_value={"remainingUsd": 9.5}):
            result = read_spend_report(db)
        providers = result["providers"]
        self.assertAlmostEqual(providers["OpenRouter"]["daily"][-1], 0.0123)
        self.assertEqual(providers["OpenRouter"]["remainingUsd"], 9.5)
        self.assertEqual(providers["Predis"]["jobs"], 1)
        self.assertEqual(providers["Predis"]["creditReports"], 0)
        self.assertEqual(providers["Predis"]["credits"], 0)
        self.assertEqual(providers["Creatify"]["dailyCredits"][-1], 7)
        self.assertIsNone(providers["Creatify"]["remainingCredits"])


if __name__ == "__main__":
    unittest.main()
