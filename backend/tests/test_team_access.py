"""Role presets and separate inbox access do not need live provider calls."""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.inbox import read_inbox
from app.permissions import effective_permissions
from app.team_roles import MODULES, role_modules


class TeamAccessTests(unittest.TestCase):
    def test_saved_role_preset_controls_new_assignments(self):
        db = MagicMock()
        db.get.return_value = SimpleNamespace(modules=["Board", "Comments"])
        self.assertEqual(role_modules(db, "viewer"), ["Board", "Comments"])

    def test_comments_only_user_can_reply_without_messages_access(self):
        user = SimpleNamespace(role="viewer", module_access=["Comments"],
                               permissions={"inbox.reply": True}, is_approver=False)
        self.assertTrue(effective_permissions(user)["inbox.reply"])
        with patch("app.inbox.Zernio") as provider:
            read_inbox(MagicMock(), user, {"detail": "posts"})
            provider.return_value.request.assert_called_once()
        with self.assertRaises(HTTPException) as error:
            read_inbox(MagicMock(), user, {"detail": "conversations"})
        self.assertEqual(error.exception.status_code, 403)

    def test_admin_preset_always_has_all_modules(self):
        self.assertEqual(role_modules(MagicMock(), "admin"), MODULES)


if __name__ == "__main__":
    unittest.main()
