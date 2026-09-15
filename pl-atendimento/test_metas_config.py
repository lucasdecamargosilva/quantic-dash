import os
import tempfile
import unittest
from metas_config import read_goals, save_goals

class SharedGoalsTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.db=os.path.join(self.tmp.name,"goals.db")
    def tearDown(self):
        self.tmp.cleanup()
    def payload(self):
        return {"owner":"Dione","goals":{"weekly":{"conversations":100,"trials":25,"closed":2},
                                         "monthly":{"conversations":400,"trials":100,"closed":5}}}
    def test_lucas_saves_shared_persistent_weekly_and_monthly_goals(self):
        d=self.payload()
        save_goals(self.db,"lucas",d)
        self.assertEqual(d["goals"],read_goals(self.db)["Dione"])
    def test_dione_cannot_write_even_with_forged_body(self):
        before=read_goals(self.db)
        d=self.payload()
        d["canEdit"]=True
        d["user"]="lucas"
        for user in ("dione",None,""):
            with self.assertRaises(PermissionError):
                save_goals(self.db,user,d)
        self.assertEqual(before,read_goals(self.db))
    def test_invalid_goal_does_not_overwrite_saved_values(self):
        before=read_goals(self.db)
        for invalid in (-1,1.5,True,"100",1000001):
            d=self.payload()
            d["goals"]["weekly"]["conversations"]=invalid
            with self.assertRaises(ValueError):
                save_goals(self.db,"lucas",d)
        self.assertEqual(before,read_goals(self.db))
