"""Exercise ROS callback ordering without starting a ROS master or a vehicle."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest


def observer_callbacks():
    source = Path(__file__).with_name('scout-mission-observer.py').read_text()
    tree = ast.parse(source)
    functions = {'command_callback', 'rolling_callback', 'fail'}
    module = ast.Module(body=[node for node in tree.body
                              if isinstance(node, ast.FunctionDef) and node.name in functions], type_ignores=[])
    events = []
    values = dict(phase='ready', track_requested=False, track_requested_wall=None,
                  rolling={}, fault=[], names=['ugv%d' % i for i in range(1, 5)],
                  time=SimpleNamespace(monotonic=lambda: 100.0),
                  rospy=SimpleNamespace(Time=SimpleNamespace(now=lambda: SimpleNamespace(to_sec=lambda: 23.252))),
                  emit=lambda kind, **value: events.append(dict(kind=kind, **value)), events=events)
    exec(compile(module, '<observer callbacks>', 'exec'), values)
    return values


class ScoutMissionObserverCallbacksTest(unittest.TestCase):
    def test_global_command_callback_accepts_rospy_single_argument(self):
        observer = observer_callbacks()
        # rospy omits callback_args when Subscriber receives None.
        observer['command_callback'](SimpleNamespace(data='track'))
        self.assertTrue(observer['track_requested'])
        self.assertEqual(observer['fault'], [])
        self.assertEqual(observer['events'][0]['robot'], None)

    def test_rolling_before_command_is_preserved_for_all_four_planners(self):
        observer = observer_callbacks()
        for index in range(1, 5):
            observer['rolling_callback'](SimpleNamespace(data=1, _connection_header={
                'callerid': ('/ugv%d/mpc' % index).encode()}))
        self.assertFalse(observer['track_requested'])
        self.assertEqual(len(observer['rolling']), 4)
        observer['command_callback'](SimpleNamespace(data='track'))
        self.assertTrue(observer['track_requested'])
        self.assertEqual(len(observer['rolling']), 4)

    def test_repeated_track_burst_does_not_restart_or_fail_the_lap(self):
        observer = observer_callbacks()
        observer['command_callback'](SimpleNamespace(data='track'))
        observer['phase'] = 'tracking'
        for _ in range(15):
            observer['command_callback'](SimpleNamespace(data='track'))
        self.assertEqual(observer['fault'], [])
        self.assertEqual(len(observer['events']), 1)
        self.assertEqual(observer['track_requested_wall'], 100.0)

    def test_track_before_initial_placement_fails(self):
        observer = observer_callbacks()
        observer['phase'] = 'preparing'
        observer['command_callback'](SimpleNamespace(data='track'))
        self.assertIn('before initial placement', observer['fault'][0])

    def test_hold_during_lap_and_foreign_publishers_are_not_accepted(self):
        observer = observer_callbacks()
        observer['rolling_callback'](SimpleNamespace(data=1, _connection_header={'callerid': '/ugv1/mpc'}))
        observer['phase'] = 'tracking'
        observer['rolling_callback'](SimpleNamespace(data=0, _connection_header={'callerid': '/ugv1/mpc'}))
        self.assertEqual(observer['rolling'], {})
        self.assertIn('left rolling', observer['fault'][0])
        observer = observer_callbacks()
        observer['rolling_callback'](SimpleNamespace(data=1, _connection_header={'callerid': '/other/mpc'}))
        self.assertEqual(observer['rolling'], {})
        self.assertIn('Unexpected planner', observer['fault'][0])


if __name__ == '__main__':
    unittest.main()
