# Linking family notes in the migration registers – what we decided and why

Status: report for review (October 2026). Scope: the kinship step of the local
person search build (`parse_kinship()` and `load_migration()` in
`scripts/person_search/build_db.py`). This report explains every decision
in plain language, so that people who do not read code can check it.

## What this is about

The Nationaal Archief indexes of the Hindostani (NT00345) and Javanese
(NT00346) contract registers have a column with family notes. The clerk
wrote down who the immigrant's relatives were, usually by giving the
relative's **contract number**:

- `Vrouw van 387` (record AB388): she is the wife of the man with contract AB387.
- `Man van 530 en vader van 531/VI` (record VI529): husband of VI530, father of VI531.
- `dochter van AA/130;AA/131`: daughter of AA130 and AA131.

When the build can read such a note, it links the two records. On the search
page you then click from the wife to her husband, from a child to its parents,
and so on.

A contract number has two parts: the **series** (one or two letters, such as
AB, VI, KG) and the **number**. Most of the difficulty is that the clerks wrote
these in many different ways.

## How we checked the work

1. **Before and after, note by note.** A test script ran the old and the new
   rules over all 19,527 family notes and listed every link that appeared,
   disappeared or changed type. We read these lists after each change and
   adjusted the rules until every disappearing link was explained (see
   "Links that disappeared" below).
2. **Full rebuild.** We rebuilt the complete search database and compared it
   with the previous one. Only the migration links changed. The 1921 census
   links, which also use contract numbers, stayed exactly the same.
3. **Fixed examples.** `scripts/person_search/test_kinship.py` holds 30 real
   notes with the result we expect, at least one for each rule below. Run it
   with `python3 scripts/person_search/test_kinship.py`.

## Results

References that we could read, per register (one note can hold several references):

| | Javanese before | Javanese after | Hindostani before | Hindostani after |
|---|---|---|---|---|
| References linked to a record | 9,882 | 11,763 | 14,642 | 14,675 |
| References read, but no matching record | 1,111 | 738 | 282 | 229 |
| Notes not understood at all | 748 | 159 | 19 | 28 |

In the database, where a husband's "man van" and his wife's "vrouw van"
form **one** link, this gives:

| Pairs of people | Javanese | Hindostani |
|---|---|---|
| Linked pairs before → after | 6,327 → 6,859 | 8,232 → 8,255 |
| New pairs | 537 (links: 375 spouse, 124 parent–child, 25 partner, 12 sibling, 4 foster or relative) | 23 |
| Wrong spouse link removed from a parent and child (step 4) | 294 | 0 |
| Vague "relative" made specific (spouse, child, sibling …) | 96 | 2 |
| Pairs no longer linked (each explained below) | 5 | 0 |

Most of the newly read references were already known from the other side
(the wife's note named the husband, and the husband's note now also names
the wife). That is why the number of new links is smaller than the number
of newly read references.

## Decisions, step by step

Each step says what we saw in the data, what we decided, and why.

### 1. Kinship words that were missing

**Seen:** `Gehuwd met 2133/WW` (married to), `Leeft met 1240/AF` (lives with),
`Broeder van 323 CC`, `Echtgenoot van V/241`, `Tweelingzus van 737VI`. The old
rules either skipped these or made them a vague "relative" link.

**Decided:** "gehuwd met", "echtgenoot" and "broeder" now give spouse,
husband and brother links. "Tweelingbroer/-zus" gives a sibling link.
**"Leeft met" gets a new link type, `partner` ("leeft samen met" on the
search page). We do not call this a marriage**, because the clerk chose
different words on purpose: these couples were not (or not yet) married.

### 2. Words glued together and short forms

**Seen:** `vrouw vanAB 734`, `manv AB1100`, `man vAB 1091`, `Vrouwvan 1232/AC`,
`Dochter/v AA552`, `Man/V 1882/YY`, `Roekijahd/v 238/LL`.

**Decided:** we separate the kinship word, the word "van" (or "v") and the
contract number before reading. This is a matter of reading what is there.
It does not involve any guessing.

### 3. Spelling mistakes by the clerk

**Seen:** `Dochetr`, `Docher`, `Vropuw`, `Vrowu`, `Moerder`, `vadre`, `zon`, `mn`.

**Decided:** a word counts as a kinship word if it differs by **one letter**
from a known word (words of four or five letters), or by **two letters**
(longer words), and **only one** kinship word is that close. Swapping two
neighbouring letters (`vadre`/`vader`) counts as one. Three very short forms
are listed by hand: `zon` = zoon, `mn` = man, `br` = broer.

**Why these limits:** short words are easily confused with each other
("man", "zus"), and Javanese names can look like Dutch words. In the middle of
a note, a misspelled word only counts if "van" or "v" follows it, so a name
that happens to look like a kinship word does not break the note apart.

### 4. More than one relation in one note (the biggest correction)

**Seen:** `Man van 530 en vader van 531/VI`. The old rules only looked at the
first word and read the whole note as "husband of 530 **and husband of 531**".
As a result, **many fathers and mothers were also linked as the spouse of
their own child** (see the numbers under "Results").

**Decided:** we split a note at every kinship word. Each part gets its own
relation: husband of VI530, father of VI531. This both adds the missing
parent links and removes the wrong spouse links.

### 5. Ranges

**Seen:** `vader van VI 792 t/m 794`, `moeder van 815 t/m 819/VI`,
`Moeder van KG219b t/m KG 219e`.

**Decided:** "t/m" (up to and including) is expanded into every number in
between. We only do this for at most 20 numbers, because a longer range is
more likely to be a slip of the pen than a family. Ranges of letters
(219b t/m 219e) work the same way.

### 6. Where the series letters are

**Seen:** the series comes before or after the number, with or without a
slash or a space (`VI 792`, `1802 WW`, `258HH`, `382a/KG`). It can also be
written with a space or dots in between (`767V V`, `K.G.`), or once for
several numbers (`dochter van 1 en 2/MR 734 en 733/AD`).

**Decided:**
- Letters with a space or dots in between are joined (`V V` → VV).
- A number without letters takes the series of the **next** number in the
  same part of the note, or else of the one before. In
  `dochter van 1 en 2/MR 734 en 733/AD` this gives MR1, MR2, AD734 and AD733.
  The old rules gave "AD1", which was wrong.
- Short words are not read as a series: in `YY 1485 en 1484` the "en" is the
  word "and", not series EN. We only accept letters as a series if that
  series exists in the register, or as **MR** (see step 8). Capital letters
  that are not a known series (such as `T/238` in the Hindostani register)
  are kept as written and stay unresolved, rather than being guessed.
- A single letter for a double series (`A/286` for AA286) was already
  accepted as "probable"; that is unchanged.

### 7. Numbers without any series: the person's own series

**Seen:** `Vrouw van 387` in record AB388.

**Decided (unchanged in principle):** a number without letters gets the
person's **own** series, because families were usually registered together.
The link is **"certain"** only if the rest of the same note uses that same
series (`Man van 530 en vader van 531/VI` in record VI529). Otherwise it is
**"probable"**. We did *not* take the series from another part of the note
when it differs from the person's own series. In
`moeder van 938 en vrouw van 185/ZZ` (record AB937) the child is AB938, not
ZZ938.

Numbers without letters next to a name or a remark (`d/v Kromoredjo en
Soekinah is op 11/10/50 …`) are ignored. Dates are removed first, so
11/10/50 is not read as three contract numbers.

### 8. Marienburg numbers (MR) and numbers in brackets

**Seen:** 470 references to series **MR**, for example
`vrouw van MR180 (AC1045)`. No record in the migration register has
series MR. Searching the whole database showed that MR numbers do appear in
the **1921 census**, almost always on the **Marienburg** estate. They are
probably the estate's own numbering.

**Decided:** MR is read as a series, so the number is not mistaken for
something else. It cannot be linked within the migration register, so it
stays unresolved. In most notes the real contract number is in brackets
next to it, `(AC1045)`, and that one is linked. A number without letters
directly before a bracketed contract number (`man van 324 (AC249)`) is
treated as the other numbering and not linked.

**Open:** MR numbers could later be linked to the 1921 census (see "What is left").

### 9. "no." – contract number, muster-roll number or deed number?

**Seen:** `Man van no. 201 (MM401)`, `gehuwd met no 24`, `Man van no 2 DD`,
`vrouw van monsterrol nummer 306`, `(ag no 1017)`.

**Investigated:** in all 14 notes that give both "no. N" and a contract
number in brackets, N turned out to be the **muster-roll number** (the
passenger number on the ship) of that same contract. But elsewhere
"no 58 FF" is clearly contract FF58, and "ag no 1017" is the number of a
marriage deed.

**Decided:**
- `no N` followed by a series (`no 2 DD`, `no19EE`) is read as that contract.
- `monsterrol nummer N` is looked up as muster-roll number N **on the same
  ship**, and only if exactly one record on that ship has that number. These
  links are "probable".
- A plain `no N` without a series is **not linked**, because we cannot tell
  which of the three meanings is meant. These notes go on the list for
  checking by hand.

### 10. Notes about someone else

**Seen:**
- `man van Pinmiten d/v 897/UU`: he is the husband of Pinmiten, and **she**
  is the daughter of UU897.
- `leeft met d/v 2228/WW`: he lives with the daughter of WW2228.
- `1- Paula … D/v Anta AC828 en Bok Sari AG364 …` in the record of AG364:
  this is about her child Paula, not about AG364 herself.

**Decided:**
- "d/v" or "z/v" (daughter/son of) right after a part of the note without a
  contract number belongs to the person mentioned there. It is not linked
  to the record's own person.
- A "daughter/son of" part that contains the record's **own** number next
  to names is about a child of this person, and is not linked.
- `Bok Siti is moeder van CC72 & CC73` ("Bok" is a form of address for a
  married woman) is about the record's own person, and is linked.

### 11. Remarks, corrections and crossed-out numbers

**Seen:** `Correctie 513/UU`, `foutief geboekt Moet zijn van 962/VV`,
`dit later doorgestreept er naast 471 AB`, `geen vrouw`, and free text such
as `Sakijo 1499VV op 6 dec 1948 distr. Sur`.

**Decided:** these parts are **not linked**. The text says the number was
wrong or crossed out, so a link would contradict the source. A part that
does not start with a kinship word and contains other words is not a
kinship note. These cases go on the list for checking by hand.

### 12. What we deliberately did not change

- **We link what the source says, even when it looks odd.** Record VI51 is
  a woman, but the note says `vader van VI52…` (father). We keep the
  relation as written (parent of), with the clerk's word. We do not guess
  what was meant.
- Contradictory notes, such as two different husbands or a "mother" who is
  also called "wife", are kept as written. Each link shows the original
  note, so a reader can judge.
- **"certain"** means the contract number is written in full in the note.
  **"probable"** means we had to fill something in: the series, a single
  letter for a double one, or the muster-roll number.

## Links that disappeared

Five pairs that were linked before are no longer linked. We checked each one:

| Record | Note | Why the old link was wrong |
|---|---|---|
| AD736, AD737 | `dochter van 1 en 2/MR 734 en 733/AD` | "1" was read as AD1. It is MR1 (step 6); now linked to AD733/AD734 instead. |
| AD743 | `dochter van 525+526/MR resp. 741+742/AD` | "525" was read as AD525. It is MR525; now linked to AD741/AD742 instead. |
| AB336 | `vrouw van 335, dit later doorgestreept er naast 471 AB` | 335 was crossed out (step 11). The replacement, AB471, is not linked automatically either: the whole note goes to the list for checking by hand. |
| AG637 | `man van Toegijem d/v 855/JJ en 472/HH` | Unclear who 472/HH is: possibly Toegijem herself, possibly her parent (step 10). Left for checking by hand. |

## What is left

After this change, the following are still not linked:

| | Javanese | Hindostani |
|---|---|---|
| Contract number not in the register (gaps in the index, or a slip of the pen) | 191 | 194 |
| Points to the record itself (`Man van AB644` in record AB644) | 77 | 35 |
| MR (Marienburg) numbers | 470 | – |
| Notes not understood (names only, `geen vrouw`, plain `no N`, long stories) | 159 | 28 |

Suggested next steps, for the team to decide:

1. **A list for checking by hand**: export the notes above (with a link to the
   record) as a spreadsheet, so that someone can fill in the right person.
2. **MR numbers ↔ 1921 census**: the census has MR numbers for Marienburg;
   linking them could connect several hundred people to the census.
3. **Names instead of numbers** (`man van DUKHANI`, `d/v Bok Krijem`): these
   could be matched by name within the same ship or plantation, but only as
   "possible" links, and only after the team agrees on the rules.
