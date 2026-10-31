import tempfile, pathlib, unittest, json, hashlib
from generate import generate, validate, SCENARIOS

class SyntheticDatasetTests(unittest.TestCase):
    def test_determinism_and_contract(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            ma=generate(pathlib.Path(a)); mb=generate(pathlib.Path(b))
            self.assertEqual(ma,mb)
            for name in SCENARIOS:
                x=(pathlib.Path(a)/(name+'.json')).read_bytes()
                self.assertEqual(x,(pathlib.Path(b)/(name+'.json')).read_bytes())
                validate(json.loads(x))
                self.assertEqual(hashlib.sha256(x).hexdigest(),ma['scenarios'][name]['sha256'])
    def test_scenario_diversity(self):
        with tempfile.TemporaryDirectory() as d:
            manifest=generate(pathlib.Path(d))
            self.assertGreaterEqual(len(manifest['scenarios']),6)
            self.assertTrue(all(v['baselineRiskRange'][0]<v['baselineRiskRange'][1] for v in manifest['scenarios'].values()))
if __name__=='__main__': unittest.main()
