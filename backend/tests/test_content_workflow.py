"""Regression checks for content/media transitions; no provider calls or DB writes."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from app import jobs, providers, workflow
from app.routes import studio


BRAND = {"version": 1, "voice": "Warm", "rules": [], "formats": {}}
CONTENT = {"caption": "A fresh caption", "tags": "#Books", "script": "Spoken words",
           "mediaBrief": "A book and savings jar", "videoDirection": "Three shots"}


def post(stage="generating", media=None):
    return SimpleNamespace(id=7, stage=stage, version=2, version_history=[], approved_version=None,
        payload={"title": "Money lessons", "caption": "Previous caption", "note": "Focus on habits",
                 "format": "image", "platform": "Instagram", "media": media or []})


def job(kind="write"):
    return SimpleNamespace(kind=kind, payload={"brand": BRAND, "previousStage": "selected"},
                           result={}, provider_id=None, status="running", actor_id=None)


class ContentWorkflowTests(unittest.TestCase):
    def test_caption_without_media_stays_selected_and_preserves_snapshot(self):
        item, task = post(), job()
        db = MagicMock()
        with patch.object(jobs, "text_completion", return_value=(json.dumps(CONTENT), {"cost": .002}, "request-1")), patch.object(jobs, "save_checks"):
            jobs.execute_text(db, task, item)
        self.assertEqual(item.stage, "selected")
        self.assertEqual(item.payload["caption"], CONTENT["caption"])
        self.assertEqual(item.version_history[0]["payload"]["caption"], "Previous caption")
        self.assertEqual(item.version_history[0]["stage"], "selected")
        self.assertEqual(task.result["usage"]["cost"], .002)

    def test_revised_text_with_existing_media_returns_to_review(self):
        item, task = post(media=[{"id": "old", "url": "/media/old"}]), job("revise")
        task.payload["inputContent"] = {"caption": "My manual edit", "note": "New input"}
        with patch.object(jobs, "text_completion", return_value=(json.dumps(CONTENT), {}, "request-2")) as completion, patch.object(jobs, "save_checks"):
            jobs.execute_text(MagicMock(), task, item)
        supplied = json.loads(completion.call_args.args[0])
        self.assertEqual(supplied["caption_context"], "My manual edit")
        self.assertEqual(item.stage, "review")
        self.assertEqual(item.payload["note"], "New input")

    def test_new_angle_updates_same_idea_without_creating_another_post(self):
        item, task, db = post("idea"), job("new_angle"), MagicMock()
        task.payload["topics"] = [{"id": 7, "title": "Money lessons"}]
        db.scalars.return_value = [item]
        result = {"ideas": [{"title": "Saving one coin at a time", "reason": "A new angle", "sourceIds": [7], "format": "image", "platform": "Instagram"}]}
        with patch.object(jobs, "text_completion", return_value=(json.dumps(result), {}, "request-3")):
            jobs.execute_text(db, task, item)
        self.assertEqual(item.id, 7)
        self.assertEqual(item.payload["title"], "Saving one coin at a time")
        self.assertEqual(item.stage, "idea")
        db.add.assert_not_called()

    def test_media_completion_moves_to_review(self):
        item, task, db = post(), job("media"), MagicMock()
        task.provider = "Predis"; task.provider_id = "remote-1"
        with patch.object(jobs, "predis_result", return_value={"urls": ["https://media.test/image.png"]}), patch.object(jobs, "download_asset", return_value=object()), patch.object(jobs, "asset_dto", return_value={"id": "new", "type": "image", "url": "/media/new"}), patch.object(jobs, "save_checks"):
            jobs.execute_media(db, task, item)
        self.assertEqual(item.stage, "review")
        self.assertEqual(item.payload["media"][0]["id"], "new")
        self.assertEqual(task.status, "completed")

    def test_legacy_text_only_review_is_exposed_as_selected(self):
        item = post("review")
        self.assertEqual(studio.post_dto(item)["stage"], "selected")

    def test_manual_edit_without_media_does_not_enter_review(self):
        item, db = post("selected"), MagicMock()
        db.scalar.side_effect = [item, None]
        with patch.object(studio, "require_permission"), patch.object(studio, "save_checks"), patch.object(studio, "audit"):
            studio.mutate_post(db, SimpleNamespace(id="admin", role="admin"), SimpleNamespace(headers={}), {"action": "update", "id": 7, "version": 2, "caption": "Saved manually"})
        self.assertEqual(item.stage, "selected")

    def test_last_attachment_removal_returns_to_selected(self):
        item, db = post("review", [{"id": "old"}]), MagicMock()
        db.scalar.side_effect = [item, None]
        with patch.object(studio, "require_permission"), patch.object(studio, "audit"):
            studio.mutate_post(db, SimpleNamespace(id="admin", role="admin"), SimpleNamespace(headers={}), {"action": "remove-media", "id": 7, "version": 2, "assetId": "old"})
        self.assertEqual(item.stage, "selected")

    def test_scheduling_without_media_is_rejected(self):
        item, db = post("review"), MagicMock(); db.scalar.return_value = item
        with patch.object(workflow, "require_permission"), self.assertRaises(HTTPException):
            workflow.schedule_command(db, SimpleNamespace(id="admin"), {"id": 7, "version": 2, "action": "save"})

    def test_openrouter_request_requires_schema_support_and_healing(self):
        schema = {"type": "object", "properties": {}, "additionalProperties": False}
        response = {"choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}], "usage": {"cost": .001}, "id": "request-4"}
        with patch.object(providers.settings, "openrouter_api_key", "test-key"), patch.object(providers.settings, "openrouter_model", "openai/gpt-4.1-mini"), patch.object(providers, "call", return_value=response) as call:
            providers.text_completion("topic", "instruction", schema)
        body = call.call_args.kwargs["json"]
        self.assertTrue(body["provider"]["require_parameters"])
        self.assertEqual(body["response_format"]["type"], "json_schema")
        self.assertEqual(body["plugins"], [{"id": "response-healing"}])

    def test_json_wrappers_are_accepted_but_truncated_content_is_rejected(self):
        self.assertEqual(providers.parse_generated_json('Here is the result:\n```json\n{"caption":"Ready"}\n```'), {"caption": "Ready"})
        with self.assertRaises(ValueError):
            providers.parse_generated_json('{"caption":"unfinished')


if __name__ == "__main__":
    unittest.main()
