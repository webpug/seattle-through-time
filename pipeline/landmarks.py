"""Landmarks drawn as hand-built models instead of plain extrusions.
Heights and completion years are from Wikipedia's 'List of tallest buildings in Seattle'."""
# id, Overture name, year completed, height m
TOWERS = [
    ('columbia', 'Columbia Center', 1985.2, 284), ('rainier_sq', 'Rainier Square', 2020.9, 259), ('1201third', '1201 Third Avenue', 1988.5, 235),
    ('twounion', 'Two Union Square', 1989.5, 226), ('municipal', 'Seattle Municipal Tower', 1990.5, 220), ('f5', 'F5 Tower', 2017.5, 197),
    ('safeco', 'Safeco Plaza', 1969.3, 192), ('russell', 'JPMorganChase Center', 2006.5, 182), ('usbank', 'U.S. Bank Centre', 1989.5, 177),
    ('wells', 'Docusign Tower', 1983.5, 175), ('800fifth', '800 Fifth Avenue', 1981.5, 166), ('901fifth', '901 Fifth', 1973.5, 163),
    ('madison', 'Madison Centre', 2017.5, 162), ('qualtrics', 'Qualtrics Tower', 2019.5, 161), ('doppler', 'Amazon.com Doppler', 2015.9, 160),
    ('day1', 'Amazon.com Day 1', 2016.8, 159), ('hyatt', 'Hyatt Regency Seattle', 2018.9, 158), ('reinvent', 'Amazon.com re:Invent', 2019.5, 158),
    ('rainier_tower', 'Rainier Tower', 1977.5, 157), ('fourthmad', 'Fourth and Madison Building', 2002.5, 156), ('smith', 'Smith Tower', 1914.5, 141),
]
# footprints removed from the tiles because a hand model replaces them
DROP_NAMES = ['Space Needle', 'Amazon.com The Spheres', 'Climate Pledge Arena']
DROP_NEAR = [('lumen', -122.3316, 47.5952, 70), ('tmobile', -122.3325, 47.5914, 100), ('husky', -122.3017, 47.6503, 60)]
