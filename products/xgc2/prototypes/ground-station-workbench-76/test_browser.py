#!/usr/bin/env python3
"""Offline browser checks for the #76 review prototype, never the product.

Requires an existing Playwright Python installation and Chromium. Installs nothing.
Default: exact HTML via set_content on about:blank, with an explicit storage-boundary
fixture. --served uses a temporary loopback HTTP origin and real browser storage.
Do not change browser security policy to make --served pass. In-memory success is
not proof of real-origin persistence, native-client integration or durable dispatch.
"""
from __future__ import annotations

import argparse
from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import sys
import time
from threading import Thread
import unittest

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
HTML = (ROOT / 'index.html').read_text()
ARGS = argparse.ArgumentParser(description=__doc__)
ARGS.add_argument('--served', action='store_true')
ARGS.add_argument('--evidence-dir', type=Path)
OPTIONS, TEST_ARGS = ARGS.parse_known_args()


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class WorkbenchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        executable = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
        if not executable:
            raise RuntimeError('Set CHROMIUM_EXECUTABLE to an existing Chromium binary.')
        cls.browser = cls.pw.chromium.launch(executable_path=executable, headless=True)
        cls.server = None
        cls.url = None
        if OPTIONS.served:
            cls.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
            Thread(target=cls.server.serve_forever, daemon=True).start()
            cls.url = f'http://127.0.0.1:{cls.server.server_port}/index.html'
        print(json.dumps({'browser': cls.browser.version,
                          'mode': 'served-real-origin' if OPTIONS.served else 'in-memory DOM + storage boundary fixture',
                          'html_sha256': hashlib.sha256((ROOT / 'index.html').read_bytes()).hexdigest()}, indent=2))

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        if cls.server:
            cls.server.shutdown()
            cls.server.server_close()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1400, 'height': 1000})
        self.errors = []
        self.requests = []
        self.context.on('page', lambda page: page.on('pageerror', lambda err: self.errors.append(str(err))))
        self.context.on('request', lambda req: self.requests.append(req.url))
        self.page = self.context.new_page()
        self.mount()
        self.page.locator('#lab-details summary').click()

    def mount(self, saved=None):
        if self.url:
            self.page.goto(self.url)
            if saved is not None:
                self.page.evaluate('(data)=>{localStorage.clear();for(const [k,v] of Object.entries(data))localStorage.setItem(k,v)}', saved)
                self.page.reload()
        else:
            # Deliberate isolated test boundary, not a production storage substitute.
            # Only JSON persistence behavior is tested; actual browser origin policy is not.
            self.page.evaluate('''(data)=>{
                window.__storageBoundary = data || {};
                Object.defineProperty(window, 'localStorage', {configurable:true, value:{
                  getItem:k=>window.__storageBoundary[k]??null,
                  setItem:(k,v)=>{window.__storageBoundary[k]=String(v)},
                  removeItem:k=>{delete window.__storageBoundary[k]}
                }});
            }''', saved or {})
            self.page.set_content(HTML)
        self.wait('typeof fixtureSnapshot === "function"')

    def restart(self):
        saved = self.page.evaluate('Object.fromEntries(Object.entries(' + ('localStorage' if self.url else '__storageBoundary') + '))')
        self.page.close()
        self.page = self.context.new_page()
        self.mount(saved)
        self.page.locator('#lab-details summary').click()

    def tearDown(self):
        self.assertEqual([], self.errors, 'Unexpected browser page errors')
        if self.url:
            self.assertTrue(all(url == self.url for url in self.requests), self.requests)
        else:
            self.assertEqual([], self.requests, 'Prototype must make no external request')
        self.context.close()

    def wait(self, expression, *, arg=None):
        # Playwright wait_for_function uses page-side eval, disallowed by this CSP.
        # Keep CSP intact; poll read-only observations via the automation boundary.
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if self.page.evaluate(expression, arg):
                return
            self.page.wait_for_timeout(40)
        self.fail('Timed out waiting for fixture state: ' + expression)

    def state(self):
        return self.page.evaluate('fixtureSnapshot()')

    def current(self):
        state = self.state()
        return next(c for c in state['conversations'] if c['id'] == state['current'])

    def click(self, name):
        self.page.get_by_role('button', name=name, exact=True).click()

    def send(self, text='Read the current definition without executing anything.', wait=True):
        self.page.locator('#draft').fill(text)
        self.page.locator('#send').click()
        if wait:
            self.wait('fixtureSnapshot().conversations.find(c=>c.id===fixtureSnapshot().current).turn === "completed"')

    def scope_live(self):
        self.page.locator('#context').click()
        self.click('Existing Session A / Run A1 · frozen cfg-6')

    def propose(self, native=False):
        if not native:
            self.scope_live()
        self.page.locator('#native-propose' if native else '#propose').click()

    def decision(self):
        return self.current()['decisions'][-1]

    def wait_decision(self, status):
        self.wait('(status)=>fixtureSnapshot().conversations.find(c=>c.id===fixtureSnapshot().current).decisions.at(-1).status===status', arg=status)

    def test_01_original_text_stream_and_no_execution(self):
        text = '  Original **emphasis** <img src=x onerror=alert(1)>\n```text\nα & <data>\n```\n$$e = x - r$$  '
        session = self.state()['runtimeSession']
        self.send(text)
        c = self.current()
        self.assertEqual(text, c['events'][0]['text'])
        self.assertEqual('prepare', c['scope'])
        self.assertEqual(session, self.state()['runtimeSession'])
        self.assertEqual(['user', 'agent'], [e['kind'] for e in c['events']])
        self.assertEqual(0, self.page.locator('#feed img').count())
        self.assertGreater(self.page.locator('#feed math').count(), 0)
        self.page.locator('#feed article').first.get_by_role('button', name='Original', exact=True).click()
        self.assertEqual(text, self.page.locator('#dialog-body > pre').text_content())

    def test_02_failure_retry_unchanged_request_and_intervening_draft(self):
        self.page.locator('#fail-send').click()
        self.send('Retain this draft', wait=False)
        self.wait('fixtureSnapshot().conversations[0].turn === "failed"')
        failed = self.current()
        self.assertEqual([], failed['events'])
        self.assertEqual('Retain this draft', failed['draft'])
        key = failed['inflight']['key']
        self.page.locator('#draft').fill('A newer unsent draft')
        self.click('Retry same request')
        self.wait('fixtureSnapshot().conversations[0].turn === "completed"')
        self.assertEqual(key, self.current()['events'][0]['requestKey'])
        self.assertEqual('A newer unsent draft', self.page.locator('#draft').input_value())

    def test_03_ime_newline_and_cancel_is_not_total_stop(self):
        self.page.locator('#draft').fill('草稿')
        self.page.locator('#draft').dispatch_event('keydown', {'key': 'Enter', 'isComposing': True})
        self.assertEqual('idle', self.current()['turn'])
        self.page.locator('#draft').press('End')
        self.page.locator('#draft').press('Shift+Enter')
        self.assertIn('\n', self.page.locator('#draft').input_value())
        self.send('Interrupted generation', wait=False)
        self.wait('fixtureSnapshot().conversations[0].turn === "streaming"')
        self.page.locator('#send').click()
        self.assertEqual('cancelled', self.current()['turn'])
        self.assertEqual('session-a', self.state()['runtimeSession'])

    def test_04_reconnect_and_duplicate_keep_identity(self):
        native = self.current()['nativeId']
        self.send(wait=False)
        self.wait('fixtureSnapshot().conversations[0].turn === "streaming"')
        self.page.locator('#disconnect').click()
        self.page.locator('#reconnect').click()
        self.click('Retry same request')
        self.wait('fixtureSnapshot().conversations[0].turn === "completed"')
        self.page.locator('#duplicate').click()
        self.assertEqual(native, self.current()['nativeId'])
        self.assertEqual(2, len(self.current()['events']))
        self.assertEqual(1, len(self.state()['conversations']))

    def test_05_conversations_drafts_archive_reopen_clear_and_restore(self):
        old_id = self.current()['id']
        self.page.locator('#draft').fill('Unsent in first conversation')
        self.page.locator('#new-conversation').click()
        self.page.locator('#new-name').fill('Preparation B')
        self.click('Create')
        self.assertNotEqual(old_id, self.current()['id'])
        self.assertEqual('', self.current()['draft'])
        self.send('Second conversation content')
        events = self.current()['events']
        native = self.current()['nativeId']
        for action in ['Archive conversation', 'Reopen conversation', 'Clear display only', 'Restore display']:
            self.page.locator('#conversation-actions').click()
            self.click(action)
            self.assertEqual(native, self.current()['nativeId'])
            self.assertEqual(events, self.current()['events'])
        self.page.locator('#conversation-list button').first.click()
        self.assertEqual('Unsent in first conversation', self.page.locator('#draft').input_value())

    def test_06_cross_conversation_stream_callbacks_do_not_retarget(self):
        self.send('First request', wait=False)
        self.page.locator('#new-conversation').click()
        self.page.locator('#new-name').fill('Second independent native context')
        self.click('Create')
        self.send('Second request')
        self.wait('fixtureSnapshot().conversations.every(c=>c.turn==="completed")')
        a, b = self.state()['conversations']
        self.assertNotEqual(a['nativeId'], b['nativeId'])
        self.assertEqual('First request', a['events'][0]['text'])
        self.assertEqual('Second request', b['events'][0]['text'])
        self.assertEqual([2, 2], [len(a['events']), len(b['events'])])

    def test_07_current_frozen_historical_and_wrong_project_refs(self):
        self.page.locator('#context').click()
        self.click('Session A · frozen configuration')
        self.assertIn('cfg-6', self.page.locator('#dialog-body').text_content())
        self.click('Attach original as text context')
        self.page.locator('#context').click()
        self.click('Current experiment definition')
        self.assertIn('cfg-7', self.page.locator('#dialog-body').text_content())
        self.click('Attach original as text context')
        self.assertEqual(['cfg-6', 'cfg-7'], [r['revision'] for r in self.current()['refs']])
        self.page.locator('#notice-fixture').click()
        self.page.locator('#project').select_option('exp-camera')
        self.click('Create')
        self.page.locator('#context').click()
        self.assertEqual(0, self.page.get_by_role('button', name='Session A · frozen configuration', exact=True).count())
        self.click('Close')
        self.page.locator('#inbox').click()
        self.click('Open source')
        self.click('Attach original as text context')
        self.assertIn('Wrong experiment', self.page.get_by_role('alert').text_content())
        self.assertEqual([], self.current()['refs'])

    def test_08_proposer_submitted_and_separate_provider_authority(self):
        self.propose(native=True)
        self.page.locator('#actor').click()
        self.assertTrue(self.page.get_by_role('button', name='Approve', exact=True).is_disabled())
        self.page.locator('#actor').click()
        self.click('Approve')
        self.assertEqual('submitted', self.decision()['status'])
        self.assertIsNone(self.decision()['receipt'])
        self.wait_decision('resolved')
        self.assertEqual('provider only', self.decision()['receipt']['dispatch'])
        self.assertIsNone(self.decision()['sessionId'])
        self.assertEqual('session-a', self.state()['runtimeSession'])

    def test_09_delayed_session_validation_and_immutable_scope(self):
        self.propose()
        snapshot = self.decision()
        self.click('Approve')
        self.page.locator('#end-session').click()
        self.wait_decision('resolved')
        d = self.decision()
        self.assertEqual('rejected: exact Session no longer active', d['receipt']['dispatch'])
        for field in ['sessionId', 'runId', 'experimentId', 'parameters', 'configRevision']:
            self.assertEqual(snapshot[field], d[field])

    def test_10_rejection_expiry_revocation_and_failed_submission(self):
        self.propose(native=True)
        self.click('Reject')
        self.wait_decision('resolved')
        self.assertEqual('not admitted', self.decision()['receipt']['dispatch'])
        for action, status in [('Expire fixture request', 'expired'), ('Revoke fixture request', 'revoked')]:
            self.page.locator('#native-propose').click()
            self.page.get_by_role('button', name='Details / receipt', exact=True).last.click()
            self.click(action)
            self.assertEqual(status, self.decision()['status'])
            self.assertIsNone(self.decision()['receipt'])
        self.page.locator('#native-propose').click()
        self.page.locator('#fail-decision').click()
        self.click('Approve')
        self.wait_decision('failed')
        key = self.decision()['decisionKey']
        self.assertIsNone(self.decision()['receipt'])
        self.click('Retry decision submission')
        self.wait_decision('resolved')
        self.assertEqual(key, self.decision()['decisionKey'])
        self.assertEqual('approved', self.decision()['receipt']['decision'])

    def test_11_park_notices_hide_read_are_not_resolution(self):
        self.page.locator('#draft').fill('Saved while away')
        self.page.locator('#system-tab').click()
        self.page.locator('#native-propose').click()
        self.assertEqual('system', self.state()['page'])
        self.assertFalse(self.state()['notices'][0]['read'])
        self.page.locator('#inbox').click()
        self.click('Hide reminder')
        self.assertFalse(self.state()['notices'][0]['read'])
        self.click('Mark read')
        self.assertEqual('pending', self.decision()['status'])
        self.click('Open source')
        self.assertEqual('workbench', self.state()['page'])
        self.click('Close')
        self.assertEqual('Saved while away', self.page.locator('#draft').input_value())

    def test_12_unavailable_source_retains_unread_and_diagnostics_stay_out(self):
        self.page.locator('#missing-evidence').click()
        self.page.locator('#inbox').click()
        self.click('Open source')
        self.assertFalse(self.state()['notices'][0]['read'])
        self.click('Close')
        self.assertIn('unavailable', self.page.get_by_role('alert').text_content())
        self.page.locator('#plumbing').click()
        self.assertEqual([], self.current()['events'])
        self.assertEqual(1, len(self.state()['diagnostics']))
        self.page.locator('#progress').click()
        self.page.locator('#progress').click()
        self.assertEqual(1, len(self.current()['events']))
        self.assertEqual(2, self.current()['events'][0]['revision'])

    def test_13_restart_preserves_pending_and_explicit_reconciliation(self):
        self.propose(native=True)
        self.page.locator('#draft').fill('Draft survives serialized restoration')
        self.click('Approve')
        key = self.decision()['decisionKey']
        self.restart()
        self.assertEqual('submitted', self.decision()['status'])
        self.assertEqual('Draft survives serialized restoration', self.page.locator('#draft').input_value())
        self.assertIsNone(self.decision()['receipt'])
        self.page.locator('#reconcile').click()
        self.assertEqual('resolved', self.decision()['status'])
        self.assertEqual(key, self.decision()['receipt']['decisionKey'])
        self.assertEqual('not admitted', self.decision()['receipt']['dispatch'])

    def test_14_bounded_history_pause_and_pending_outside_page(self):
        self.page.locator('#long-stream').click()
        self.wait('fixtureSnapshot().conversations[0].events.length===1000')
        self.assertEqual(40, self.page.locator('#feed article').count())
        self.page.locator('#older').click()
        old_end = self.current()['end']
        self.assertFalse(self.current()['follow'])
        self.page.locator('#long-stream').click()
        self.wait('fixtureSnapshot().conversations[0].events.length===2000')
        self.assertEqual(old_end, self.current()['end'])
        self.assertEqual(40, self.page.locator('#feed article').count())
        self.page.locator('#native-propose').click()
        self.assertIn('decisions', self.page.locator('#attention').text_content())
        self.page.locator('#follow').click()
        self.assertEqual(40, self.page.locator('#feed article').count())
        self.assertTrue(self.current()['follow'])

    def test_15_four_controls_geometry_menus_themes(self):
        self.page.locator('#width').click()
        self.page.locator('#lab-details summary').click()
        self.page.locator('#draft').fill('Geometry sample')
        for theme in ['light', 'dark']:
            if theme == 'dark':
                self.page.locator('#theme').click()
            for width in [1400, 320]:
                self.page.set_viewport_size({'width': width, 'height': 1000})
                boxes = self.page.locator('#composer-controls').evaluate('(n)=>[...n.children].map(x=>({id:x.id,...x.getBoundingClientRect().toJSON()}))')
                self.assertEqual(1, len({round(box['y'], 1) for box in boxes}))
                self.assertEqual((32, 32), (boxes[-1]['width'], boxes[-1]['height']))
                for left, right in zip(boxes, boxes[1:]):
                    self.assertLessEqual(left['right'], right['left'])
                self.page.locator('#permission').click()
                self.page.get_by_role('menuitemradio').last.click()
                self.assertEqual('restricted', self.current()['options']['permission'])
                self.page.locator('#reason').click()
                self.page.keyboard.press('End')
                self.page.keyboard.press('Enter')
                self.assertEqual('medium', self.current()['options']['reason'])
                self.assertEqual('reason', self.page.evaluate('document.activeElement.id'))
            self.page.set_viewport_size({'width': 1400, 'height': 1000})
            if OPTIONS.evidence_dir:
                OPTIONS.evidence_dir.mkdir(parents=True, exist_ok=True)
                self.page.screenshot(path=str(OPTIONS.evidence_dir / f'307px-{theme}.png'))
        self.assertEqual(0, self.page.locator('button:not([data-xgc-id])').count())

    def test_16_context_selection_does_not_retarget_inflight_prompt(self):
        self.send('A preparation request', wait=False)
        self.scope_live()
        self.wait('fixtureSnapshot().conversations[0].turn === "completed"')
        event = self.current()['events'][0]
        self.assertEqual('prepare', event['context']['scope'])
        self.assertIsNone(event['context']['sessionId'])
        self.assertEqual('live', self.current()['scope'])

    def test_17_settings_conflict_and_exact_effective_metadata(self):
        self.page.locator('#settings').click()
        self.page.locator('#setting-model').select_option('fixture-a')
        self.click('Simulate concurrent settings update')
        self.click('Save defaults')
        self.assertIn('Revision conflict', self.page.locator('#settings-error').text_content())
        self.assertEqual('fixture-a', self.page.locator('#setting-model').input_value())
        self.click('Close')
        self.page.locator('#settings').click()
        self.page.locator('#setting-model').select_option('fixture-a')
        self.click('Save defaults')
        self.send()
        options = self.current()['events'][0]['options']
        self.assertEqual('fixture-a', options['model']['effective'])
        self.assertEqual('software/provider default', options['model']['source'])
        self.assertEqual('none', options['robotAuthority'])


if __name__ == '__main__':
    unittest.main(argv=[sys.argv[0], *TEST_ARGS], verbosity=2)
