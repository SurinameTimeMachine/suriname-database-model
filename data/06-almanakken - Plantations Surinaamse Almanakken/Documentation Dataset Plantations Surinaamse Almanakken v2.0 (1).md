## **Documentation Dataset Plantations Surinaamse Almanakken version 2.0**

Thunnis van Oort, Rick Mourits and Coen van Galen, June 2026

The dataset ‘Plantations Surinaamse Almanakken v2.0.csv’ is an improved version of v1.0 and is based on list of plantations published in the _Surinaamsche Almanak_ (1818-1847) and the _Almanak voor de Nederlandsche West-Indische bezittingen, en de kust van Guinea_ (1856-1861). New editions of the almanacks were published for most years between 1818 and 1861, containing wide-ranging information about the then Dutch colony or Suriname, including a detailed list of plantations.[1] The almanacs are available online at dbnl.org (National Library of the Netherlands) as scans and ocr’ed text.[2] The plantation tables published in each of these editions form the basis for the dataset.

The ocr’ed information from the Almanacs was transcribed and imported into one spreadsheet per annual edition by student assistant Doortje Swaters as part of the Historical Database of Suriname and the Caribbean (HDSC) project at Radboud University. The ocr’ed data was corrected and cleaned by Evi Smits during an internship at the HDSC team. In the next phase, the separate spreadsheets have been merged into a single spreadsheet by Nico Altink and Thunnis van Oort. They have continued to clean and standardize the data, using Open Refine. They received support from student assistant Damian Pikulić.

Each edition of the Almanac contained a list of plantations in Suriname and some other locations such as military posts. The plantations were organized per river or creek, and in some cases per road. Per plantation, at least the name of the plantation is listed, and usually the produce, owner, administrator, and plantation manager. In later editions, information was added about the number of enslaved and free persons living on the plantation, the size of the plot, the type of mill and the district or division in which the plantation was located. Especially the information on enslaved and free workers became more elaborate in the 1850s.

The dataset includes references to www.wikidata.org. The wikidata identifier (Q-id) functions as the unique identifier of a plantation.

In the period covered by the Almanaks, plantations would regularly merge into larger units or split into smaller parts. E.g. the plantations “Waterland” (Q59134059) and “Adrichem” (Q124812970) on the Suriname river merged into the combined “Waterland en Adrichem” (Q59134062) during the years 1828-1831 and after those years continued as separate plantations. When a plantation was merged or split, the dataset contains both the singular plantation_id and the id of the composite plantation it was part of ('part_of_id'); or the other way around, the singular ids ('has_parts_id' 1 to 4) of which a merged plantation was composed.

Plantations in the dataset have been linked to plantations that occur in another dataset: the Suriname Plantation Dataset from the Suriname Slave registers.[3] This second dataset contains all

> 1Fred. Oudschans Dentz, 'Surinaamsche Almanakken', De West-Indische Gids, 28 (1947), 175-176. See also Carl Haarnack, Surinaamsche Almanak voor het jaar 1832. Departement Paramaribo der Maatschappij Tot Nut van ’t Algemeen. Amsterdam: C.G. Sulpke, 1831, Bukubooks blog, https://bukubooks.wordpress.com/2014/12/07/almanak1832/ [consulted 18-12-2024] 2Surinaamsche Almanak: https://www.dbnl.org/tekst/_sur001suri01_01/  and Almanak voor de Nederlandsche West-Indische Bezittingen: https://www.dbnl.org/tekst/_alm009alma00_01/

> 3 Rosenbaum-Feldbrügge, Matthias; van Galen, Coen; Swaters, Doortje, 2023, "Suriname Plantation Dataset Version

> 1.0", https://hdl.handle.net/10622/VTL43W, IISH Data Collection, V1, UNF:6:by8B0cpjp8fexFugrZZ34A== [fileUNF]

the plantations (identified with the 'psur_id') that were legal entities that owned enslaved persons.

## **What is new in version 2?**

Version 1.0 of the dataset contained numerous errors, both transcription mistakes and other data errors, for example plantations that were incorrectly disambiguated – especially plantations at different locations carrying the same name. Thunnis van Oort and Rick Mourits have cleaned the data through multiple iterations of correction rounds, checking for duplications, missing years and other chronological discontinuities, and unusual patterns in crop type or surface area of plantations. This has resulted in a multitude of corrections in the new version.

Entries were changed, de-duplicated, removed, or added. Version 1 counted 1,172 entries (unique plantations/locations); version 2 has 1,110, of which 972 return in version 2 with the same identifier and name; 93 have received corrections to the name; 6 plantations received a new identifier; 101 plantations were removed, and 39 plantations were added. And many values have been corrected, such as plantation product, size, etcetera.

The following table contains a brief explanation of all the columns in the dataset. Please note that the columns after ‘lot’, in particular the information about owners, administrators and managers, contain unprocessed transcription data: the information in these columns has not been cleaned or standardized and can still contain errors and should be used with caution. In a future version 3 of the dataset, we plan to further enhance the data these columns, especially on persons and legal entities that owned or managed plantations.

|**Field name v2.0**|**Explanation**|**Orig. field name**<br>**(v1.0)**|
|---|---|---|
|recordid|Unique record id based on year-<br>page-id row number||
|id|Row number of the original tabel<br>on a specific page of the almanac||
|year|Almanac edition, that would reflect<br>information of the previous year||
|page|Page number in the original source||
|litt_std|Letter that designates the district or<br>division (standardized but not com-<br>plete)||
|district_of_divisie|Name of administrative district (not<br>complete)||
|loc_org|Original location description (re-<br>gion/district)||
|loc_std|Location, standardized (region/dis-<br>trict)||
|river_or_road|Aggregated region based on main<br>river or road|[NEW in v2.0]|
|direction|Direction of the plantation in rela-<br>tion to the road or river (left/right<br>and up or down the river or road)||



|plantation_std|Standardized name of the planta-<br>tion||
|---|---|---|
|plantation_org|Original plantation name||
|plantation_id|Unique id for plantation, also refer-<br>ring to the wikidata.org page<br>(https://www.wiki-<br>data.org/wiki/[place id here])||
|psur_id|ID of the same plantation in the Su-<br>riname Plantation Dataset from the<br>Suriname Slave registers||
|psur_id2|Alternative ID of the same planta-<br>tion in the Suriname Plantation Da-<br>taset from the Suriname Slave reg-<br>isters|[NEW in v2.0]|
|has_parts1_lab|Plantation name of the individual<br>plantation that is part of a compo-<br>site plantation in this row|split1_lab|
|has_parts1_id|Plantation id of the individual plan-<br>tation that is part of a composite<br>plantation in this row|split1_id|
|has_parts2_lab|Plantation name of the individual<br>plantation that is part of a compo-<br>site plantation in this row|split2_lab|
|has_parts2_id|Plantation id of the individual plan-<br>tation that is part of a composite<br>plantation in this row|split2_id|
|has_parts3_lab|Plantation name of the individual<br>plantation that is part of a compo-<br>site plantation in this row|split3_lab|
|has_parts3_id|Plantation id of the individual plan-<br>tation that is part of a composite<br>plantation in this row|split3_id|
|has_parts4_lab|Plantation name of the individual<br>plantation that is part of a compo-<br>site plantation in this row|split4_lab|
|has_parts4_id|Plantation id of the individual plan-<br>tation that is part of a composite<br>plantation in this row|split4_id|
|part_of_lab|Plantation name of the composite<br>plantation listed in this row (plan-<br>tation_id)|partof_lab|
|part_of_id|Plantation id of the composite plan-<br>tation listed in this row (planta-<br>tion_id)|part of_id|
|reference_org|Original reference to another plan-<br>tation, that is the legal entity that<br>owns the plantation in this row||
|owned_by_lab|Reference to plantation (standard-<br>ized name), that is the legal entity<br>that owns the plantation in this row|refer-<br>ence_std_lab|
|owned_by_id|Reference to plantation id that is<br>the legal entity that owns the plan-<br>tation inthisrow|reference_std_id|



|owned_by_id2|Reference to a second plantation id<br>that is the legal entity that owns the<br>plantation in this row|[NEW in v2.0]|
|---|---|---|
|size_std|Size of the land area in acres ('ak-<br>ker'), standardized||
|product_std|Produce cultivated at the planta-<br>tion, standardized||
|enslaved_norm|Total number of enslaved on this<br>plantation (normalized integer that<br>includes the sum of all relevant col-<br>umns)|[NEW in v2.0]|
|enslaved_shared_with|In case the Almanak indicates that<br>the stated number of enslaved peo-<br>ple is shared with another planta-<br>tion, the ID of that plantation is<br>given here|[NEW in v2.0]|
|function|For some locations a specific func-<br>tion was mentioned, such as mili-<br>tary or medical post||
|additional_info|Additional information (in Dutch),<br>not standardized||
|deserted|Denotes when a plantation has<br>been deserted ('verlaten')||
|lot|Code designating original plot num-<br>ber or other identifier from original<br>source (data not yet cleaned)|nummer|
|administrateurs|Administrator for the absentee<br>owners||
|directeuren|Plantation manager||
|eigenaren|Owner||
|administrateurs_in_Europa|Administrator in Europe, for the ab-<br>sentee owners||
|administrateurs_in_suriname|Administrator in Suriname, for the<br>absentee owners||
|blank-officier|Overseer||
|slaven|Number of enslaved persons (origi-<br>nal transcription, see column ‘en-<br>slaved_norm’ for normalized to-<br>tals).||
|sranantongo_naam|Name the plantation was known by<br>among the enslaved population|namen_totslaaf-<br>gemaakten|
|plantage_mannelijke_niet_vrije_be-<br>woners|Number of male enslaved inhabit-<br>ants owned by plantation||
|plantage_totaal_niet_vrije_be-<br>woners|Total number of enslaved inhabit-<br>ants owned by plantation||
|plantage_vrouwelijke_niet_vrije_be<br>woners|Number of female enslaved inhabit-<br>ants owned by plantation||
|privé_mannelijke_niet_vrije_be-<br>woners|Number of male enslaved inhabit-<br>ants owned by private person||
|privé_totaal_niet_vrije_bewoners|Total number of enslaved inhabit-<br>ants owned by private person||



|privé_vrouwelijke_niet_vrije_be-<br>woners|Number of female enslaved inhabit-<br>ants owned by private person||
|---|---|---|
|soort_van_molen|Type of mill||
|totaal_generaal_bewoners|Total number of inhabitants||
|vrije_bewoners|Total number of free inhabitants||
|generaal_totaal_slaven|Total number of enslaved inhabit-<br>ants||
|generale_macht_slaven_ges-<br>chikt_tot_werken_plantages|Number of enslaved inhabitants<br>owned by plantation fit for labour||
|generale_macht_slaven_ges-<br>chikt_tot_werken_privé|Number of enslaved inhabitants<br>owned by private person fit for la-<br>bour||
|generale_macht_slaven_onges-<br>chikt_tot_werken_plantages|Number of enslaved inhabitants<br>owned by plantation unfit for la-<br>bour||
|generale_macht_slaven_onges-<br>chikt_tot_werken_privé|Number of enslaved inhabitants<br>owned by private person unfit for<br>labour||
|totaal_slaven_op_de_plantages_aan-<br>wezig_geschikt_tot_werk|Total number of enslaved inhabit-<br>ants fit for labour||
|totaal_slaven_op_de_plantages_aan-<br>wezig_ongeschikt_tot_werk|Total number of enslaved inhabit-<br>ants unfit for labour||
|vrije_perso-<br>nen_op_plantages_jongens|Free inhabitants (boys)||
|vrije_personen_op_plantages_man-<br>nen|Free inhabitants (adult men)||
|vrije_personen_op_plantages_meis-<br>jes|Free inhabitants (girls)||
|vrije_perso-<br>nen_op_plantages_vrouwen|Free inhabitants (adult women)||
|vrije_personen_op_plantages_totaal|Free inhabitants (total)||
|werktuig_stoom|Steam engine||
|werktuig_water|Waterengine||



The table below contains a brief explanation of some of the Dutch words that occur in the dataset.

|**Dutch term**|**Explanation**|
|---|---|
|Aan|belongs to (in column‘eigenaren’)|
|Administrateur|administrator for the absentee owners|
|Afvaren|downstream|
|Beide|both|



|Blankofficier|litt: white overseer, free overseer|
|---|---|
|Brandhout|fire wood|
|Chirurgisch etablissement|medical post|
|Cacao|cocoa|
|Directeur|manager of a plantation|
|Eigenaar|owner|
|Grond|piece of land|
|Heelmeester|medical doctor|
|Hout|wood|
|Katoen|cotton|
|Kerk|church|
|Koffie|coffee|
|Kollegietuin|experimental garden (proeftuin)|
|Kost|food (for enslaved plantation workers)|
|Kweek|seedling nursery|
|Links|left|
|Litt.|Letter|
|Militaire post|military post|
|Oevers|banks of a river or creek|
|Onbekend|Unknown|
|Opvaren|upstream|
|Pad|road|
|Rechts|right|
|Rijst|rice|
|Rijweg|road|
|Steen|stone quarry|
|Stoom|steam engine|
|Suiker|sugar|
|Verlaten|deserted|
|Waterwerk|water mill|
|Weg|road|
|Weggespoeld|flooded|
|Zeekust|sea coast|
|Zie|‘see’ –plantationbelongs to (incolumn ‘eigenaren’)|
