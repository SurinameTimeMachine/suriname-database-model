"""Examples for parse_kinship, one per rule in docs/person-search-kinship-linking.md.

Run with `python3 scripts/person_search/test_kinship.py` (or pytest); no data files needed.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_db import parse_kinship  # noqa: E402

SERIES = {'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'DD', 'HH', 'JJ', 'KG', 'MM', 'UU', 'VI', 'VV', 'WW', 'YY', 'A', 'W'}

# (kinship note, own contract number, expected [(detail, confidence, contract key)])
CASES = [
    # already handled before this change
    ('dochter van AA/130;AA/131', 'AA/132', [('daughter', 'certain', 'AA/130'), ('daughter', 'certain', 'AA/131')]),
    ('Vrouw van 180', 'A180', [('wife', 'probable', 'A/180')]),
    # 1. 'gehuwd met' and 'leeft met'
    ('Gehuwd met 2133/WW.', 'WW2132', [('married', 'certain', 'WW/2133')]),
    ('Leeft met 1240/AF.', 'AF1338', [('lives with', 'certain', 'AF/1240')]),
    # 2. glued words and abbreviations
    ('vrouw vanAB 734', 'AB735', [('wife', 'certain', 'AB/734')]),
    ('manv AB1100', 'AB1099', [('husband', 'certain', 'AB/1100')]),
    ('man vAB 1091', 'AB1090', [('husband', 'certain', 'AB/1091')]),
    ('Vrouwvan 1232/AC.', 'AC1233', [('wife', 'certain', 'AC/1232')]),
    # 3. misspellings
    ('Dochetr van AA297 en AA298', 'AA299', [('daughter', 'certain', 'AA/297'), ('daughter', 'certain', 'AA/298')]),
    ('Man van 464 en vadre van 465/VI', 'VI463', [('husband', 'certain', 'VI/464'), ('father', 'certain', 'VI/465')]),
    # 4. more than one relation in one note
    ('Man van 530 en vader van 531/VI', 'VI529', [('husband', 'certain', 'VI/530'), ('father', 'certain', 'VI/531')]),
    # 5. ranges
    ('man van VI 326 en vader van VI 327 t/m 329', 'VI325',
     [('husband', 'certain', 'VI/326'), ('father', 'certain', 'VI/327'), ('father', 'certain', 'VI/328'),
      ('father', 'certain', 'VI/329')]),
    ('Moeder van KG219b t/m KG 219d.', 'KG219a',
     [('mother', 'certain', 'KG/219B'), ('mother', 'certain', 'KG/219C'), ('mother', 'certain', 'KG/219D')]),
    # 6. series written apart, after the number, or once for several numbers
    ('Vrouw van 767V V .', 'VV766', [('wife', 'certain', 'VV/767')]),
    ('dochter van 1 en 2/MR  734 en 733/AD', 'AD736',
     [('daughter', 'certain', 'MR/1'), ('daughter', 'certain', 'MR/2'), ('daughter', 'certain', 'AD/734'),
      ('daughter', 'certain', 'AD/733')]),
    ('BR/V 868/MR EN 1721/YY', 'YY1721a', [('brother', 'certain', 'MR/868'), ('brother', 'certain', 'YY/1721')]),
    # 7. Marienburg numbers and numbers in brackets
    ('Vrouw van 167Mr. (PP3)', 'PP4', [('wife', 'certain', 'MR/167'), ('wife', 'certain', 'PP/3')]),
    ('man van 324 (AC249)', 'AC248', [('husband', 'certain', 'AC/249')]),
    # 8. 'no.' and muster-roll numbers
    ('Man van no 2 DD', 'DD1', [('husband', 'certain', 'DD/2')]),
    ('Vrouw van no. 9 (Mm366).', 'MM371', [('wife', 'certain', 'MM/366')]),
    ('gehuwd met no 24', 'UU230', []),
    ('vrouw van monsterrol nummer 306.', 'AD1311', [('wife', 'probable', '#306')]),
    # 9. phrases about someone else
    ('man van Pinmiten d/v  897/UU', 'AG632', []),
    ('leeft met d/v 2228/WW', 'AG568', []),
    ('1- Paula (vrl) geb 8-9-1933 . D/v Anta AC828 en Bok Sari AG364 heeft gekozen', 'AG364', []),
    ('Bok Siti is moeder van CC72& CC73', 'CC71', [('mother', 'certain', 'CC/72'), ('mother', 'certain', 'CC/73')]),
    # 10. remarks, corrections and crossed-out numbers
    ('Vrouw van 741/VV. Correctie 513/UU', 'VV751', [('wife', 'certain', 'VV/741')]),
    ('Moeder van 2432/WW foutief geboekt Moet zijn van 962/VV.', 'WW2431', []),
    ('Sakijo 1499VV op 6 dec 1948 distr. Sur', 'AC582', []),
    ('geen vrouw', 'AF1263', []),
]


def test_parse_kinship():
    failures = []
    for note, own, expected in CASES:
        got = sorted((detail, confidence, key) for _, _, detail, confidence, key, _ in parse_kinship(note, own, SERIES))
        if got != sorted(expected):
            failures.append(f'{note!r} ({own}):\n  expected {expected}\n  got      {got}')
    assert not failures, '\n'.join(failures)


if __name__ == '__main__':
    test_parse_kinship()
    print(f'{len(CASES)} kinship examples ok')
