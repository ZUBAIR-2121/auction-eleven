import type { Footballer, LineupRole, PlayerType, Position } from "@auction-eleven/shared";

type PlayerSeed = readonly [name: string, country: string, overall: number, trait: string];


type RoleProfile = { primaryRole: LineupRole; secondaryRoles: LineupRole[] };
const role = (primaryRole: LineupRole, ...secondaryRoles: LineupRole[]): RoleProfile => ({ primaryRole, secondaryRoles });

/**
 * Curated, card-game-style position profiles. These are maintained locally so
 * the game does not scrape or bundle a proprietary third-party database.
 */
const POSITION_PROFILES: Record<string, RoleProfile> = {
  "Alisson Becker": role("GK"), "Thibaut Courtois": role("GK"), "Gianluigi Donnarumma": role("GK"),
  "Ederson": role("GK"), "Marc-André ter Stegen": role("GK"), "Jan Oblak": role("GK"),
  "Mike Maignan": role("GK"), "Emiliano Martínez": role("GK"), "Manuel Neuer": role("GK"),
  "Diogo Costa": role("GK"), "Gregor Kobel": role("GK"), "David Raya": role("GK"),
  "Unai Simón": role("GK"), "Yassine Bounou": role("GK"), "André Onana": role("GK"),
  "Wojciech Szczęsny": role("GK"), "Jordan Pickford": role("GK"), "Giorgi Mamardashvili": role("GK"),
  "Aaron Ramsdale": role("GK"), "Keylor Navas": role("GK"), "Dominik Livaković": role("GK"),
  "Yann Sommer": role("GK"), "Lucas Chevalier": role("GK"), "Anatoliy Trubin": role("GK"),

  "Virgil van Dijk": role("CB"), "Rúben Dias": role("CB"), "William Saliba": role("CB"),
  "Antonio Rüdiger": role("CB"), "Marquinhos": role("CB", "CDM"), "Alessandro Bastoni": role("CB", "LB"),
  "Ronald Araújo": role("CB", "RB"), "Éder Militão": role("CB", "RB"), "Joško Gvardiol": role("CB", "LB"),
  "Achraf Hakimi": role("RB", "RWB", "RM"), "Theo Hernández": role("LB", "LWB", "LM"),
  "Trent Alexander-Arnold": role("RB", "CM", "CDM", "RWB"),
  "Alphonso Davies": role("LB", "LWB", "LM"), "John Stones": role("CB", "CDM", "CM"),
  "Gabriel Magalhães": role("CB"), "Cristian Romero": role("CB"), "Jules Koundé": role("RB", "CB"),
  "Kim Min-jae": role("CB"), "Matthijs de Ligt": role("CB"), "Pau Cubarsí": role("CB"),
  "Nuno Mendes": role("LB", "LWB", "LM"), "Dani Carvajal": role("RB", "RWB"),
  "Dayot Upamecano": role("CB"), "Lisandro Martínez": role("CB", "LB", "CDM"),

  "Rodri": role("CDM", "CM"), "Jude Bellingham": role("CAM", "CM"),
  "Kevin De Bruyne": role("CAM", "CM"), "Federico Valverde": role("CM", "RM", "CDM"),
  "Pedri": role("CM", "CAM", "LM"), "Jamal Musiala": role("CAM", "LM", "LW"),
  "Martin Ødegaard": role("CAM", "CM"), "Declan Rice": role("CDM", "CM"),
  "Bruno Fernandes": role("CAM", "CM"), "Bernardo Silva": role("CAM", "CM", "RM", "RW"),
  "Florian Wirtz": role("CAM", "LW", "LM"), "Vitinha": role("CM", "CDM", "CAM"),
  "Nicolò Barella": role("CM", "RM", "CAM"), "Frenkie de Jong": role("CM", "CDM"),
  "Joshua Kimmich": role("CDM", "CM", "RB"), "Alexis Mac Allister": role("CM", "CDM", "CAM"),
  "İlkay Gündoğan": role("CM", "CAM", "CDM"), "Eduardo Camavinga": role("CM", "CDM", "LB"),
  "Aurélien Tchouaméni": role("CDM", "CM", "CB"), "Enzo Fernández": role("CM", "CDM"),
  "Hakan Çalhanoğlu": role("CDM", "CM", "CAM"), "Xavi Simons": role("CAM", "LW", "RW", "LM", "RM"),
  "Dominik Szoboszlai": role("CAM", "CM", "RM"), "Martín Zubimendi": role("CDM", "CM"),

  "Kylian Mbappé": role("ST", "LW"), "Erling Haaland": role("ST"),
  "Vinícius Júnior": role("LW", "ST"), "Mohamed Salah": role("RW", "RM", "ST"),
  "Harry Kane": role("ST", "CF"), "Robert Lewandowski": role("ST"),
  "Lamine Yamal": role("RW", "RM", "LW"), "Bukayo Saka": role("RW", "RM"),
  "Rodrygo": role("RW", "LW", "ST", "CF"), "Lautaro Martínez": role("ST", "CF"),
  "Victor Osimhen": role("ST"), "Khvicha Kvaratskhelia": role("LW", "RW", "CAM"),
  "Son Heung-min": role("LW", "ST", "LM"), "Rafael Leão": role("LW", "LM", "ST"),
  "Antoine Griezmann": role("CF", "ST", "CAM", "RW"), "Ousmane Dembélé": role("RW", "LW", "CAM"),
  "Phil Foden": role("RW", "CAM", "LW", "CM"), "Julián Álvarez": role("ST", "CF", "CAM"),
  "Alexander Isak": role("ST", "LW"), "Luis Díaz": role("LW", "LM", "RW"),
  "Cole Palmer": role("CAM", "RW", "RM"), "Cristiano Ronaldo": role("ST", "LW"),
  "Lionel Messi": role("RW", "CAM", "CF", "ST"), "Neymar": role("LW", "CAM", "ST", "CF")
};


type SuppliedCatalogueEntry = { id: string; name: string; photoSearchName: string };
type ImportedPlayerSeed = {
  canonicalId: string;
  name: string;
  photoSearchName: string;
  country: string;
  overall: number;
  playerType: PlayerType;
  primaryRole: LineupRole;
  secondaryRoles: LineupRole[];
  trait: string;
};

const SUPPLIED_CATALOGUE: SuppliedCatalogueEntry[] = [
  { id: "lionel-messi", name: "Lionel Messi", photoSearchName: "Lionel Messi" },
  { id: "cristiano-ronaldo", name: "Cristiano Ronaldo", photoSearchName: "Cristiano Ronaldo" },
  { id: "neymar", name: "Neymar", photoSearchName: "Neymar" },
  { id: "kylian-mbappe", name: "Kylian Mbappé", photoSearchName: "Kylian Mbappé" },
  { id: "erling-haaland", name: "Erling Haaland", photoSearchName: "Erling Haaland" },
  { id: "mohamed-salah", name: "Mohamed Salah", photoSearchName: "Mohamed Salah" },
  { id: "kevin-de-bruyne", name: "Kevin De Bruyne", photoSearchName: "Kevin De Bruyne" },
  { id: "robert-lewandowski", name: "Robert Lewandowski", photoSearchName: "Robert Lewandowski" },
  { id: "luka-modric", name: "Luka Modrić", photoSearchName: "Luka Modrić" },
  { id: "karim-benzema", name: "Karim Benzema", photoSearchName: "Karim Benzema" },
  { id: "vinicius-junior", name: "Vinícius Júnior", photoSearchName: "Vinícius Júnior" },
  { id: "jude-bellingham", name: "Jude Bellingham", photoSearchName: "Jude Bellingham" },
  { id: "rodri", name: "Rodri", photoSearchName: "Rodri footballer" },
  { id: "harry-kane", name: "Harry Kane", photoSearchName: "Harry Kane" },
  { id: "antoine-griezmann", name: "Antoine Griezmann", photoSearchName: "Antoine Griezmann" },
  { id: "son-heung-min", name: "Son Heung-min", photoSearchName: "Son Heung-min" },
  { id: "virgil-van-dijk", name: "Virgil van Dijk", photoSearchName: "Virgil van Dijk" },
  { id: "alisson", name: "Alisson Becker", photoSearchName: "Alisson Becker" },
  { id: "thibaut-courtois", name: "Thibaut Courtois", photoSearchName: "Thibaut Courtois" },
  { id: "manuel-neuer", name: "Manuel Neuer", photoSearchName: "Manuel Neuer" },
  { id: "marc-andre-ter-stegen", name: "Marc-André ter Stegen", photoSearchName: "Marc-André ter Stegen" },
  { id: "jan-oblak", name: "Jan Oblak", photoSearchName: "Jan Oblak" },
  { id: "ederson", name: "Ederson", photoSearchName: "Ederson footballer" },
  { id: "ruben-dias", name: "Rúben Dias", photoSearchName: "Rúben Dias" },
  { id: "william-saliba", name: "William Saliba", photoSearchName: "William Saliba" },
  { id: "trent-alexander-arnold", name: "Trent Alexander-Arnold", photoSearchName: "Trent Alexander-Arnold" },
  { id: "achraf-hakimi", name: "Achraf Hakimi", photoSearchName: "Achraf Hakimi" },
  { id: "alphonso-davies", name: "Alphonso Davies", photoSearchName: "Alphonso Davies" },
  { id: "theo-hernandez", name: "Theo Hernández", photoSearchName: "Theo Hernández" },
  { id: "joshua-kimmich", name: "Joshua Kimmich", photoSearchName: "Joshua Kimmich" },
  { id: "toni-kroos", name: "Toni Kroos", photoSearchName: "Toni Kroos" },
  { id: "casemiro", name: "Casemiro", photoSearchName: "Casemiro" },
  { id: "bruno-fernandes", name: "Bruno Fernandes", photoSearchName: "Bruno Fernandes" },
  { id: "bernardo-silva", name: "Bernardo Silva", photoSearchName: "Bernardo Silva" },
  { id: "pedri", name: "Pedri", photoSearchName: "Pedri footballer" },
  { id: "gavi", name: "Gavi", photoSearchName: "Gavi footballer" },
  { id: "federico-valverde", name: "Federico Valverde", photoSearchName: "Federico Valverde" },
  { id: "declan-rice", name: "Declan Rice", photoSearchName: "Declan Rice" },
  { id: "martin-odegaard", name: "Martin Ødegaard", photoSearchName: "Martin Ødegaard" },
  { id: "jamal-musiala", name: "Jamal Musiala", photoSearchName: "Jamal Musiala" },
  { id: "florian-wirtz", name: "Florian Wirtz", photoSearchName: "Florian Wirtz" },
  { id: "bukayo-saka", name: "Bukayo Saka", photoSearchName: "Bukayo Saka" },
  { id: "phil-foden", name: "Phil Foden", photoSearchName: "Phil Foden" },
  { id: "lamine-yamal", name: "Lamine Yamal", photoSearchName: "Lamine Yamal" },
  { id: "rodrygo", name: "Rodrygo", photoSearchName: "Rodrygo footballer" },
  { id: "lautaro-martinez", name: "Lautaro Martínez", photoSearchName: "Lautaro Martínez" },
  { id: "victor-osimhen", name: "Victor Osimhen", photoSearchName: "Victor Osimhen" },
  { id: "khvicha-kvaratskhelia", name: "Khvicha Kvaratskhelia", photoSearchName: "Khvicha Kvaratskhelia" },
  { id: "rafael-leao", name: "Rafael Leão", photoSearchName: "Rafael Leão" },
  { id: "ousmane-dembele", name: "Ousmane Dembélé", photoSearchName: "Ousmane Dembélé" },
  { id: "paulo-dybala", name: "Paulo Dybala", photoSearchName: "Paulo Dybala" },
  { id: "angel-di-maria", name: "Ángel Di María", photoSearchName: "Ángel Di María" },
  { id: "luis-suarez", name: "Luis Suárez", photoSearchName: "Luis Suárez footballer" },
  { id: "sadio-mane", name: "Sadio Mané", photoSearchName: "Sadio Mané" },
  { id: "riyad-mahrez", name: "Riyad Mahrez", photoSearchName: "Riyad Mahrez" },
  { id: "ngolo-kante", name: "N'Golo Kanté", photoSearchName: "N'Golo Kanté" },
  { id: "paul-pogba", name: "Paul Pogba", photoSearchName: "Paul Pogba" },
  { id: "sergio-busquets", name: "Sergio Busquets", photoSearchName: "Sergio Busquets" },
  { id: "gerard-pique", name: "Gerard Piqué", photoSearchName: "Gerard Piqué" },
  { id: "sergio-ramos", name: "Sergio Ramos", photoSearchName: "Sergio Ramos" },
  { id: "marcelo", name: "Marcelo Vieira", photoSearchName: "Marcelo Vieira" },
  { id: "dani-alves", name: "Dani Alves", photoSearchName: "Dani Alves" },
  { id: "thiago-silva", name: "Thiago Silva", photoSearchName: "Thiago Silva footballer" },
  { id: "giorgio-chiellini", name: "Giorgio Chiellini", photoSearchName: "Giorgio Chiellini" },
  { id: "leonardo-bonucci", name: "Leonardo Bonucci", photoSearchName: "Leonardo Bonucci" },
  { id: "zlatan-ibrahimovic", name: "Zlatan Ibrahimović", photoSearchName: "Zlatan Ibrahimović" },
  { id: "eden-hazard", name: "Eden Hazard", photoSearchName: "Eden Hazard" },
  { id: "gareth-bale", name: "Gareth Bale", photoSearchName: "Gareth Bale" },
  { id: "wayne-rooney", name: "Wayne Rooney", photoSearchName: "Wayne Rooney" },
  { id: "david-beckham", name: "David Beckham", photoSearchName: "David Beckham" },
  { id: "frank-lampard", name: "Frank Lampard", photoSearchName: "Frank Lampard" },
  { id: "steven-gerrard", name: "Steven Gerrard", photoSearchName: "Steven Gerrard" },
  { id: "john-terry", name: "John Terry", photoSearchName: "John Terry" },
  { id: "rio-ferdinand", name: "Rio Ferdinand", photoSearchName: "Rio Ferdinand" },
  { id: "petr-cech", name: "Petr Čech", photoSearchName: "Petr Čech" },
  { id: "iker-casillas", name: "Iker Casillas", photoSearchName: "Iker Casillas" },
  { id: "gianluigi-buffon", name: "Gianluigi Buffon", photoSearchName: "Gianluigi Buffon" },
  { id: "pele", name: "Pelé", photoSearchName: "Pelé" },
  { id: "diego-maradona", name: "Diego Maradona", photoSearchName: "Diego Maradona" },
  { id: "ronaldo-nazario", name: "Ronaldo Nazário", photoSearchName: "Ronaldo Luís Nazário de Lima" },
  { id: "ronaldinho", name: "Ronaldinho", photoSearchName: "Ronaldinho" },
  { id: "kaka", name: "Kaká", photoSearchName: "Kaká" },
  { id: "rivaldo", name: "Rivaldo", photoSearchName: "Rivaldo" },
  { id: "romario", name: "Romário", photoSearchName: "Romário" },
  { id: "cafu", name: "Cafu", photoSearchName: "Cafu footballer" },
  { id: "roberto-carlos", name: "Roberto Carlos", photoSearchName: "Roberto Carlos footballer" },
  { id: "zico", name: "Zico", photoSearchName: "Zico footballer" },
  { id: "garrincha", name: "Garrincha", photoSearchName: "Garrincha" },
  { id: "johan-cruyff", name: "Johan Cruyff", photoSearchName: "Johan Cruyff" },
  { id: "franz-beckenbauer", name: "Franz Beckenbauer", photoSearchName: "Franz Beckenbauer" },
  { id: "gerd-muller", name: "Gerd Müller", photoSearchName: "Gerd Müller" },
  { id: "lothar-matthaus", name: "Lothar Matthäus", photoSearchName: "Lothar Matthäus" },
  { id: "ferenc-puskas", name: "Ferenc Puskás", photoSearchName: "Ferenc Puskás" },
  { id: "alfredo-di-stefano", name: "Alfredo Di Stéfano", photoSearchName: "Alfredo Di Stéfano" },
  { id: "eusebio", name: "Eusébio", photoSearchName: "Eusébio" },
  { id: "george-best", name: "George Best", photoSearchName: "George Best" },
  { id: "bobby-charlton", name: "Bobby Charlton", photoSearchName: "Bobby Charlton" },
  { id: "thierry-henry", name: "Thierry Henry", photoSearchName: "Thierry Henry" },
  { id: "dennis-bergkamp", name: "Dennis Bergkamp", photoSearchName: "Dennis Bergkamp" },
  { id: "patrick-vieira", name: "Patrick Vieira", photoSearchName: "Patrick Vieira" },
  { id: "roy-keane", name: "Roy Keane", photoSearchName: "Roy Keane" },
  { id: "paolo-maldini", name: "Paolo Maldini", photoSearchName: "Paolo Maldini" },
  { id: "franco-baresi", name: "Franco Baresi", photoSearchName: "Franco Baresi" },
  { id: "alessandro-nesta", name: "Alessandro Nesta", photoSearchName: "Alessandro Nesta" },
  { id: "fabio-cannavaro", name: "Fabio Cannavaro", photoSearchName: "Fabio Cannavaro" },
  { id: "andrea-pirlo", name: "Andrea Pirlo", photoSearchName: "Andrea Pirlo" },
  { id: "francesco-totti", name: "Francesco Totti", photoSearchName: "Francesco Totti" },
  { id: "alessandro-del-piero", name: "Alessandro Del Piero", photoSearchName: "Alessandro Del Piero" },
  { id: "roberto-baggio", name: "Roberto Baggio", photoSearchName: "Roberto Baggio" },
  { id: "marco-van-basten", name: "Marco van Basten", photoSearchName: "Marco van Basten" },
  { id: "ruud-gullit", name: "Ruud Gullit", photoSearchName: "Ruud Gullit" },
  { id: "frank-rijkaard", name: "Frank Rijkaard", photoSearchName: "Frank Rijkaard" },
  { id: "clarence-seedorf", name: "Clarence Seedorf", photoSearchName: "Clarence Seedorf" },
  { id: "xavi", name: "Xavi Hernández", photoSearchName: "Xavi Hernández" },
  { id: "andres-iniesta", name: "Andrés Iniesta", photoSearchName: "Andrés Iniesta" },
  { id: "carles-puyol", name: "Carles Puyol", photoSearchName: "Carles Puyol" },
  { id: "david-villa", name: "David Villa", photoSearchName: "David Villa" },
  { id: "fernando-torres", name: "Fernando Torres", photoSearchName: "Fernando Torres" },
  { id: "raul", name: "Raúl González", photoSearchName: "Raúl González" },
  { id: "luis-figo", name: "Luís Figo", photoSearchName: "Luís Figo" },
  { id: "deco", name: "Deco", photoSearchName: "Deco footballer" },
  { id: "didier-drogba", name: "Didier Drogba", photoSearchName: "Didier Drogba" },
  { id: "samuel-etoo", name: "Samuel Eto'o", photoSearchName: "Samuel Eto'o" },
  { id: "yaya-toure", name: "Yaya Touré", photoSearchName: "Yaya Touré" },
  { id: "jay-jay-okocha", name: "Jay-Jay Okocha", photoSearchName: "Jay-Jay Okocha" },
  { id: "george-weah", name: "George Weah", photoSearchName: "George Weah" },
  { id: "michael-essien", name: "Michael Essien", photoSearchName: "Michael Essien" },
  { id: "pavel-nedved", name: "Pavel Nedvěd", photoSearchName: "Pavel Nedvěd" },
  { id: "andriy-shevchenko", name: "Andriy Shevchenko", photoSearchName: "Andriy Shevchenko" },
  { id: "hakan-sukur", name: "Hakan Şükür", photoSearchName: "Hakan Şükür" },
  { id: "lev-yashin", name: "Lev Yashin", photoSearchName: "Lev Yashin" },
  { id: "dino-zoff", name: "Dino Zoff", photoSearchName: "Dino Zoff" },
  { id: "oliver-kahn", name: "Oliver Kahn", photoSearchName: "Oliver Kahn" },
  { id: "edwin-van-der-sar", name: "Edwin van der Sar", photoSearchName: "Edwin van der Sar" },
  { id: "peter-schmeichel", name: "Peter Schmeichel", photoSearchName: "Peter Schmeichel" },
];

const FAMOUS_OVR_UPGRADES: Record<string, number> = {
  "Lionel Messi": 96,
  "Cristiano Ronaldo": 94,
  "Neymar": 93,
  "Kylian Mbappé": 96,
  "Erling Haaland": 95,
  "Mohamed Salah": 94,
  "Kevin De Bruyne": 92,
  "Robert Lewandowski": 91,
  "Vinícius Júnior": 95,
  "Jude Bellingham": 95,
  "Rodri": 95,
  "Harry Kane": 94,
  "Antoine Griezmann": 91,
  "Son Heung-min": 90,
  "Virgil van Dijk": 93,
  "Alisson Becker": 92,
  "Thibaut Courtois": 92,
  "Manuel Neuer": 90,
  "Marc-André ter Stegen": 89,
  "Jan Oblak": 89,
  "Ederson": 89,
  "Rúben Dias": 91,
  "William Saliba": 91,
  "Trent Alexander-Arnold": 90,
  "Achraf Hakimi": 92,
  "Alphonso Davies": 90,
  "Theo Hernández": 90,
  "Joshua Kimmich": 89,
  "Bruno Fernandes": 91,
  "Bernardo Silva": 91,
  "Pedri": 92,
  "Federico Valverde": 92,
  "Declan Rice": 91,
  "Martin Ødegaard": 91,
  "Jamal Musiala": 93,
  "Florian Wirtz": 93,
  "Bukayo Saka": 92,
  "Phil Foden": 91,
  "Lamine Yamal": 94,
  "Rodrygo": 90,
  "Lautaro Martínez": 92,
  "Victor Osimhen": 91,
  "Khvicha Kvaratskhelia": 92,
  "Rafael Leão": 90,
  "Ousmane Dembélé": 93,
};

const CATALOGUE_ADDITIONS: ImportedPlayerSeed[] = [
  { canonicalId: "luka-modric", name: "Luka Modrić", photoSearchName: "Luka Modrić", country: "Croatia", overall: 92, playerType: "CURRENT", primaryRole: "CM", secondaryRoles: ["CAM"], trait: "Tempo master" },
  { canonicalId: "karim-benzema", name: "Karim Benzema", photoSearchName: "Karim Benzema", country: "France", overall: 91, playerType: "CURRENT", primaryRole: "ST", secondaryRoles: ["CF"], trait: "Complete link striker" },
  { canonicalId: "toni-kroos", name: "Toni Kroos", photoSearchName: "Toni Kroos", country: "Germany", overall: 95, playerType: "ICON", primaryRole: "CM", secondaryRoles: ["CDM"], trait: "Passing metronome" },
  { canonicalId: "casemiro", name: "Casemiro", photoSearchName: "Casemiro", country: "Brazil", overall: 88, playerType: "CURRENT", primaryRole: "CDM", secondaryRoles: ["CM"], trait: "Defensive shield" },
  { canonicalId: "gavi", name: "Gavi", photoSearchName: "Gavi footballer", country: "Spain", overall: 89, playerType: "CURRENT", primaryRole: "CM", secondaryRoles: ["CAM", "LM"], trait: "Relentless press" },
  { canonicalId: "paulo-dybala", name: "Paulo Dybala", photoSearchName: "Paulo Dybala", country: "Argentina", overall: 89, playerType: "CURRENT", primaryRole: "CAM", secondaryRoles: ["CF", "ST", "RW"], trait: "Left-foot creator" },
  { canonicalId: "angel-di-maria", name: "Ángel Di María", photoSearchName: "Ángel Di María", country: "Argentina", overall: 88, playerType: "CURRENT", primaryRole: "RW", secondaryRoles: ["RM", "CAM", "LW"], trait: "Big-game creator" },
  { canonicalId: "luis-suarez", name: "Luis Suárez", photoSearchName: "Luis Suárez footballer", country: "Uruguay", overall: 95, playerType: "ICON", primaryRole: "ST", secondaryRoles: ["CF"], trait: "Predatory striker" },
  { canonicalId: "sadio-mane", name: "Sadio Mané", photoSearchName: "Sadio Mané", country: "Senegal", overall: 88, playerType: "CURRENT", primaryRole: "LW", secondaryRoles: ["ST", "RW"], trait: "Explosive runner" },
  { canonicalId: "riyad-mahrez", name: "Riyad Mahrez", photoSearchName: "Riyad Mahrez", country: "Algeria", overall: 88, playerType: "CURRENT", primaryRole: "RW", secondaryRoles: ["RM", "CAM"], trait: "Silky left foot" },
  { canonicalId: "ngolo-kante", name: "N'Golo Kanté", photoSearchName: "N'Golo Kanté", country: "France", overall: 89, playerType: "CURRENT", primaryRole: "CDM", secondaryRoles: ["CM"], trait: "Ball-winning engine" },
  { canonicalId: "paul-pogba", name: "Paul Pogba", photoSearchName: "Paul Pogba", country: "France", overall: 87, playerType: "CURRENT", primaryRole: "CM", secondaryRoles: ["CAM", "CDM"], trait: "Powerful playmaker" },
  { canonicalId: "sergio-busquets", name: "Sergio Busquets", photoSearchName: "Sergio Busquets", country: "Spain", overall: 95, playerType: "ICON", primaryRole: "CDM", secondaryRoles: ["CM"], trait: "Positional controller" },
  { canonicalId: "gerard-pique", name: "Gerard Piqué", photoSearchName: "Gerard Piqué", country: "Spain", overall: 94, playerType: "ICON", primaryRole: "CB", secondaryRoles: [], trait: "Ball-playing stopper" },
  { canonicalId: "sergio-ramos", name: "Sergio Ramos", photoSearchName: "Sergio Ramos", country: "Spain", overall: 96, playerType: "ICON", primaryRole: "CB", secondaryRoles: ["RB"], trait: "Big-game defender" },
  { canonicalId: "marcelo", name: "Marcelo Vieira", photoSearchName: "Marcelo Vieira", country: "Brazil", overall: 95, playerType: "ICON", primaryRole: "LB", secondaryRoles: ["LWB", "LM"], trait: "Creative fullback" },
  { canonicalId: "dani-alves", name: "Dani Alves", photoSearchName: "Dani Alves", country: "Brazil", overall: 95, playerType: "ICON", primaryRole: "RB", secondaryRoles: ["RWB", "RM"], trait: "Attacking fullback" },
  { canonicalId: "thiago-silva", name: "Thiago Silva", photoSearchName: "Thiago Silva footballer", country: "Brazil", overall: 88, playerType: "CURRENT", primaryRole: "CB", secondaryRoles: [], trait: "Elite reading of play" },
  { canonicalId: "giorgio-chiellini", name: "Giorgio Chiellini", photoSearchName: "Giorgio Chiellini", country: "Italy", overall: 94, playerType: "ICON", primaryRole: "CB", secondaryRoles: [], trait: "Defensive warrior" },
  { canonicalId: "leonardo-bonucci", name: "Leonardo Bonucci", photoSearchName: "Leonardo Bonucci", country: "Italy", overall: 93, playerType: "ICON", primaryRole: "CB", secondaryRoles: [], trait: "Long-range distributor" },
  { canonicalId: "zlatan-ibrahimovic", name: "Zlatan Ibrahimović", photoSearchName: "Zlatan Ibrahimović", country: "Sweden", overall: 95, playerType: "ICON", primaryRole: "ST", secondaryRoles: ["CF"], trait: "Acrobatic target forward" },
  { canonicalId: "eden-hazard", name: "Eden Hazard", photoSearchName: "Eden Hazard", country: "Belgium", overall: 94, playerType: "ICON", primaryRole: "LW", secondaryRoles: ["CAM", "LM"], trait: "Close-control dribbler" },
  { canonicalId: "gareth-bale", name: "Gareth Bale", photoSearchName: "Gareth Bale", country: "Wales", overall: 95, playerType: "ICON", primaryRole: "RW", secondaryRoles: ["LW", "ST"], trait: "Explosive left foot" },
  { canonicalId: "wayne-rooney", name: "Wayne Rooney", photoSearchName: "Wayne Rooney", country: "England", overall: 95, playerType: "ICON", primaryRole: "CF", secondaryRoles: ["ST", "CAM"], trait: "Complete forward" },
  { canonicalId: "david-beckham", name: "David Beckham", photoSearchName: "David Beckham", country: "England", overall: 95, playerType: "ICON", primaryRole: "RM", secondaryRoles: ["CM", "RW"], trait: "Crossing specialist" },
  { canonicalId: "frank-lampard", name: "Frank Lampard", photoSearchName: "Frank Lampard", country: "England", overall: 94, playerType: "ICON", primaryRole: "CM", secondaryRoles: ["CAM"], trait: "Late-box scorer" },
  { canonicalId: "steven-gerrard", name: "Steven Gerrard", photoSearchName: "Steven Gerrard", country: "England", overall: 95, playerType: "ICON", primaryRole: "CM", secondaryRoles: ["CDM", "CAM"], trait: "All-action captain" },
  { canonicalId: "john-terry", name: "John Terry", photoSearchName: "John Terry", country: "England", overall: 94, playerType: "ICON", primaryRole: "CB", secondaryRoles: [], trait: "Aerial commander" },
  { canonicalId: "rio-ferdinand", name: "Rio Ferdinand", photoSearchName: "Rio Ferdinand", country: "England", overall: 94, playerType: "ICON", primaryRole: "CB", secondaryRoles: [], trait: "Composed defender" },
  { canonicalId: "petr-cech", name: "Petr Čech", photoSearchName: "Petr Čech", country: "Czech Republic", overall: 95, playerType: "ICON", primaryRole: "GK", secondaryRoles: [], trait: "Elite shot stopper" },
  { canonicalId: "iker-casillas", name: "Iker Casillas", photoSearchName: "Iker Casillas", country: "Spain", overall: 96, playerType: "ICON", primaryRole: "GK", secondaryRoles: [], trait: "Lightning reflexes" },
  { canonicalId: "gianluigi-buffon", name: "Gianluigi Buffon", photoSearchName: "Gianluigi Buffon", country: "Italy", overall: 97, playerType: "ICON", primaryRole: "GK", secondaryRoles: [], trait: "Goalkeeping legend" },
  { canonicalId: "pele", name: "Pelé", photoSearchName: "Pelé", country: "Brazil", overall: 99, playerType: "ICON", primaryRole: "CF", secondaryRoles: ["ST", "CAM"], trait: "All-time attacking great" },
  { canonicalId: "diego-maradona", name: "Diego Maradona", photoSearchName: "Diego Maradona", country: "Argentina", overall: 99, playerType: "ICON", primaryRole: "CAM", secondaryRoles: ["CF", "RW"], trait: "Unmatched creative genius" },
  { canonicalId: "ronaldo-nazario", name: "Ronaldo Nazário", photoSearchName: "Ronaldo Luís Nazário de Lima", country: "Brazil", overall: 98, playerType: "ICON", primaryRole: "ST", secondaryRoles: ["CF"], trait: "Phenomenal complete striker" },
  { canonicalId: "ronaldinho", name: "Ronaldinho", photoSearchName: "Ronaldinho", country: "Brazil", overall: 97, playerType: "ICON", primaryRole: "LW", secondaryRoles: ["CAM", "RW"], trait: "Joyful creative magician" },
  { canonicalId: "kaka", name: "Kaká", photoSearchName: "Kaká", country: "Brazil", overall: 96, playerType: "ICON", primaryRole: "CAM", secondaryRoles: ["CM", "CF"], trait: "Gliding playmaker" },
  { canonicalId: "rivaldo", name: "Rivaldo", photoSearchName: "Rivaldo", country: "Brazil", overall: 96, playerType: "ICON", primaryRole: "CAM", secondaryRoles: ["LW", "CF"], trait: "Left-foot match winner" },
  { canonicalId: "romario", name: "Romário", photoSearchName: "Romário", country: "Brazil", overall: 96, playerType: "ICON", primaryRole: "ST", secondaryRoles: ["CF"], trait: "Box finishing master" },
  { canonicalId: "cafu", name: "Cafu", photoSearchName: "Cafu footballer", country: "Brazil", overall: 96, playerType: "ICON", primaryRole: "RB", secondaryRoles: ["RWB"], trait: "Relentless right back" },
  { canonicalId: "roberto-carlos", name: "Roberto Carlos", photoSearchName: "Roberto Carlos footballer", country: "Brazil", overall: 97, playerType: "ICON", primaryRole: "LB", secondaryRoles: ["LWB"], trait: "Explosive attacking left back" },
  { canonicalId: "zico", name: "Zico", photoSearchName: "Zico footballer", country: "Brazil", overall: 97, playerType: "ICON", primaryRole: "CAM", secondaryRoles: ["CM", "CF"], trait: "Elite number ten" },
  { canonicalId: "garrincha", name: "Garrincha", photoSearchName: "Garrincha", country: "Brazil", overall: 97, playerType: "ICON", primaryRole: "RW", secondaryRoles: ["RM"], trait: "One-on-one genius" },
  { canonicalId: "johan-cruyff", name: "Johan Cruyff", photoSearchName: "Johan Cruyff", country: "Netherlands", overall: 99, playerType: "ICON", primaryRole: "CF", secondaryRoles: ["CAM", "ST"], trait: "Total football icon" },
  { canonicalId: "franz-beckenbauer", name: "Franz Beckenbauer", photoSearchName: "Franz Beckenbauer", country: "Germany", overall: 98, playerType: "ICON", primaryRole: "CB", secondaryRoles: ["CDM"], trait: "Libero supreme" },
  { canonicalId: "gerd-muller", name: "Gerd Müller", photoSearchName: "Gerd Müller", country: "Germany", overall: 97, playerType: "ICON", primaryRole: "ST", secondaryRoles: [], trait: "Penalty-box machine" },
  { canonicalId: "lothar-matthaus", name: "Lothar Matthäus", photoSearchName: "Lothar Matthäus", country: "Germany", overall: 97, playerType: "ICON", primaryRole: "CM", secondaryRoles: ["CDM", "CAM"], trait: "Complete midfield leader" },
  { canonicalId: "ferenc-puskas", name: "Ferenc Puskás", photoSearchName: "Ferenc Puskás", country: "Hungary", overall: 98, playerType: "ICON", primaryRole: "ST", secondaryRoles: ["CF"], trait: "Historic left-foot finisher" },
  { canonicalId: "alfredo-di-stefano", name: "Alfredo Di Stéfano", photoSearchName: "Alfredo Di Stéfano", country: "Argentina", overall: 98, playerType: "ICON", primaryRole: "CF", secondaryRoles: ["ST", "CAM", "CM"], trait: "Complete all-phase attacker" },
  { canonicalId: "eusebio", name: "Eusébio", photoSearchName: "Eusébio", country: "Portugal", overall: 97, playerType: "ICON", primaryRole: "ST", secondaryRoles: ["CF"], trait: "Powerful legendary scorer" },
  { canonicalId: "george-best", name: "George Best", photoSearchName: "George Best", country: "Northern Ireland", overall: 96, playerType: "ICON", primaryRole: "RW", secondaryRoles: ["LW", "CAM"], trait: "Flair winger" },
  { canonicalId: "bobby-charlton", name: "Bobby Charlton", photoSearchName: "Bobby Charlton", country: "England", overall: 96, playerType: "ICON", primaryRole: "CAM", secondaryRoles: ["CM", "CF"], trait: "Long-range legend" },
  { canonicalId: "thierry-henry", name: "Thierry Henry", photoSearchName: "Thierry Henry", country: "France", overall: 97, playerType: "ICON", primaryRole: "ST", secondaryRoles: ["LW"], trait: "Elegant explosive finisher" },
  { canonicalId: "dennis-bergkamp", name: "Dennis Bergkamp", photoSearchName: "Dennis Bergkamp", country: "Netherlands", overall: 95, playerType: "ICON", primaryRole: "CF", secondaryRoles: ["CAM", "ST"], trait: "Technical second striker" },
  { canonicalId: "patrick-vieira", name: "Patrick Vieira", photoSearchName: "Patrick Vieira", country: "France", overall: 95, playerType: "ICON", primaryRole: "CM", secondaryRoles: ["CDM"], trait: "Dominant midfield presence" },
  { canonicalId: "roy-keane", name: "Roy Keane", photoSearchName: "Roy Keane", country: "Ireland", overall: 94, playerType: "ICON", primaryRole: "CDM", secondaryRoles: ["CM"], trait: "Relentless midfield leader" },
  { canonicalId: "paolo-maldini", name: "Paolo Maldini", photoSearchName: "Paolo Maldini", country: "Italy", overall: 98, playerType: "ICON", primaryRole: "CB", secondaryRoles: ["LB"], trait: "Defensive perfection" },
  { canonicalId: "franco-baresi", name: "Franco Baresi", photoSearchName: "Franco Baresi", country: "Italy", overall: 97, playerType: "ICON", primaryRole: "CB", secondaryRoles: [], trait: "Master sweeper" },
  { canonicalId: "alessandro-nesta", name: "Alessandro Nesta", photoSearchName: "Alessandro Nesta", country: "Italy", overall: 96, playerType: "ICON", primaryRole: "CB", secondaryRoles: [], trait: "Elegant marker" },
  { canonicalId: "fabio-cannavaro", name: "Fabio Cannavaro", photoSearchName: "Fabio Cannavaro", country: "Italy", overall: 96, playerType: "ICON", primaryRole: "CB", secondaryRoles: [], trait: "Elite anticipation" },
  { canonicalId: "andrea-pirlo", name: "Andrea Pirlo", photoSearchName: "Andrea Pirlo", country: "Italy", overall: 95, playerType: "ICON", primaryRole: "CM", secondaryRoles: ["CDM", "CAM"], trait: "Deep-lying maestro" },
  { canonicalId: "francesco-totti", name: "Francesco Totti", photoSearchName: "Francesco Totti", country: "Italy", overall: 95, playerType: "ICON", primaryRole: "CF", secondaryRoles: ["CAM", "ST"], trait: "Creative captain" },
  { canonicalId: "alessandro-del-piero", name: "Alessandro Del Piero", photoSearchName: "Alessandro Del Piero", country: "Italy", overall: 95, playerType: "ICON", primaryRole: "CF", secondaryRoles: ["ST", "LW"], trait: "Elegant finisher" },
  { canonicalId: "roberto-baggio", name: "Roberto Baggio", photoSearchName: "Roberto Baggio", country: "Italy", overall: 96, playerType: "ICON", primaryRole: "CAM", secondaryRoles: ["CF", "ST"], trait: "Divine playmaker" },
  { canonicalId: "marco-van-basten", name: "Marco van Basten", photoSearchName: "Marco van Basten", country: "Netherlands", overall: 97, playerType: "ICON", primaryRole: "ST", secondaryRoles: [], trait: "Complete classic striker" },
  { canonicalId: "ruud-gullit", name: "Ruud Gullit", photoSearchName: "Ruud Gullit", country: "Netherlands", overall: 98, playerType: "ICON", primaryRole: "CM", secondaryRoles: ["CAM", "CDM", "ST"], trait: "Total football powerhouse" },
  { canonicalId: "frank-rijkaard", name: "Frank Rijkaard", photoSearchName: "Frank Rijkaard", country: "Netherlands", overall: 96, playerType: "ICON", primaryRole: "CDM", secondaryRoles: ["CB", "CM"], trait: "Elegant defensive anchor" },
  { canonicalId: "clarence-seedorf", name: "Clarence Seedorf", photoSearchName: "Clarence Seedorf", country: "Netherlands", overall: 94, playerType: "ICON", primaryRole: "CM", secondaryRoles: ["CAM"], trait: "Powerful technician" },
  { canonicalId: "xavi", name: "Xavi Hernández", photoSearchName: "Xavi Hernández", country: "Spain", overall: 97, playerType: "ICON", primaryRole: "CM", secondaryRoles: ["CDM"], trait: "Midfield metronome" },
  { canonicalId: "andres-iniesta", name: "Andrés Iniesta", photoSearchName: "Andrés Iniesta", country: "Spain", overall: 97, playerType: "ICON", primaryRole: "CM", secondaryRoles: ["CAM", "LW"], trait: "Press-resistant genius" },
  { canonicalId: "carles-puyol", name: "Carles Puyol", photoSearchName: "Carles Puyol", country: "Spain", overall: 95, playerType: "ICON", primaryRole: "CB", secondaryRoles: ["RB"], trait: "Warrior captain" },
  { canonicalId: "david-villa", name: "David Villa", photoSearchName: "David Villa", country: "Spain", overall: 94, playerType: "ICON", primaryRole: "ST", secondaryRoles: ["LW"], trait: "Two-footed finisher" },
  { canonicalId: "fernando-torres", name: "Fernando Torres", photoSearchName: "Fernando Torres", country: "Spain", overall: 94, playerType: "ICON", primaryRole: "ST", secondaryRoles: [], trait: "Explosive striker" },
  { canonicalId: "raul", name: "Raúl González", photoSearchName: "Raúl González", country: "Spain", overall: 95, playerType: "ICON", primaryRole: "CF", secondaryRoles: ["ST"], trait: "Intelligent goal scorer" },
  { canonicalId: "luis-figo", name: "Luís Figo", photoSearchName: "Luís Figo", country: "Portugal", overall: 96, playerType: "ICON", primaryRole: "RW", secondaryRoles: ["RM", "CAM"], trait: "Ballon d'Or winger" },
  { canonicalId: "deco", name: "Deco", photoSearchName: "Deco footballer", country: "Portugal", overall: 93, playerType: "ICON", primaryRole: "CAM", secondaryRoles: ["CM"], trait: "Creative connector" },
  { canonicalId: "didier-drogba", name: "Didier Drogba", photoSearchName: "Didier Drogba", country: "Ivory Coast", overall: 95, playerType: "ICON", primaryRole: "ST", secondaryRoles: [], trait: "Powerful big-game striker" },
  { canonicalId: "samuel-etoo", name: "Samuel Eto'o", photoSearchName: "Samuel Eto'o", country: "Cameroon", overall: 96, playerType: "ICON", primaryRole: "ST", secondaryRoles: ["RW"], trait: "Rapid elite finisher" },
  { canonicalId: "yaya-toure", name: "Yaya Touré", photoSearchName: "Yaya Touré", country: "Ivory Coast", overall: 95, playerType: "ICON", primaryRole: "CM", secondaryRoles: ["CDM", "CAM"], trait: "Midfield powerhouse" },
  { canonicalId: "jay-jay-okocha", name: "Jay-Jay Okocha", photoSearchName: "Jay-Jay Okocha", country: "Nigeria", overall: 93, playerType: "ICON", primaryRole: "CAM", secondaryRoles: ["RW", "RM"], trait: "Flair specialist" },
  { canonicalId: "george-weah", name: "George Weah", photoSearchName: "George Weah", country: "Liberia", overall: 96, playerType: "ICON", primaryRole: "ST", secondaryRoles: ["CF"], trait: "Explosive Ballon d'Or striker" },
  { canonicalId: "michael-essien", name: "Michael Essien", photoSearchName: "Michael Essien", country: "Ghana", overall: 94, playerType: "ICON", primaryRole: "CDM", secondaryRoles: ["CM", "RB"], trait: "Dynamic ball winner" },
  { canonicalId: "pavel-nedved", name: "Pavel Nedvěd", photoSearchName: "Pavel Nedvěd", country: "Czech Republic", overall: 95, playerType: "ICON", primaryRole: "LM", secondaryRoles: ["CM", "CAM"], trait: "Two-footed engine" },
  { canonicalId: "andriy-shevchenko", name: "Andriy Shevchenko", photoSearchName: "Andriy Shevchenko", country: "Ukraine", overall: 95, playerType: "ICON", primaryRole: "ST", secondaryRoles: [], trait: "Clinical channel striker" },
  { canonicalId: "hakan-sukur", name: "Hakan Şükür", photoSearchName: "Hakan Şükür", country: "Turkey", overall: 92, playerType: "ICON", primaryRole: "ST", secondaryRoles: [], trait: "Powerful target striker" },
  { canonicalId: "lev-yashin", name: "Lev Yashin", photoSearchName: "Lev Yashin", country: "Soviet Union", overall: 98, playerType: "ICON", primaryRole: "GK", secondaryRoles: [], trait: "Black Spider" },
  { canonicalId: "dino-zoff", name: "Dino Zoff", photoSearchName: "Dino Zoff", country: "Italy", overall: 96, playerType: "ICON", primaryRole: "GK", secondaryRoles: [], trait: "Calm goalkeeping legend" },
  { canonicalId: "oliver-kahn", name: "Oliver Kahn", photoSearchName: "Oliver Kahn", country: "Germany", overall: 96, playerType: "ICON", primaryRole: "GK", secondaryRoles: [], trait: "Commanding shot stopper" },
  { canonicalId: "edwin-van-der-sar", name: "Edwin van der Sar", photoSearchName: "Edwin van der Sar", country: "Netherlands", overall: 95, playerType: "ICON", primaryRole: "GK", secondaryRoles: [], trait: "Complete tall keeper" },
  { canonicalId: "peter-schmeichel", name: "Peter Schmeichel", photoSearchName: "Peter Schmeichel", country: "Denmark", overall: 96, playerType: "ICON", primaryRole: "GK", secondaryRoles: [], trait: "Dominant penalty-area keeper" },
];

const normalizeIdentityName = (value: string): string => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/\b(jr|junior)\b\.?/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const IDENTITY_ALIASES: Record<string, string> = {
  "neymar": "neymar",
  "neymar da silva santos": "neymar",
  "neymar da silva santos junior": "neymar",
  "alisson becker": "alisson",
  "marcelo vieira": "marcelo",
  "xavi hernandez": "xavi",
  "raul gonzalez": "raul",
  "ronaldo luis nazario de lima": "ronaldo-nazario",
  "ronaldo nazario": "ronaldo-nazario",
  "cristiano ronaldo": "cristiano-ronaldo"
};

const suppliedIdByNormalizedName = new Map(
  SUPPLIED_CATALOGUE.map(entry => [normalizeIdentityName(entry.name), entry.id] as const)
);
const suppliedPhotoById = new Map(SUPPLIED_CATALOGUE.map(entry => [entry.id, entry.photoSearchName] as const));

export function canonicalizeFootballerIdentity(name: string): string {
  const normalized = normalizeIdentityName(name);
  const alias = IDENTITY_ALIASES[normalized];
  if (alias) return alias;
  const supplied = suppliedIdByNormalizedName.get(normalized);
  if (supplied) return supplied;
  return normalized.replace(/\s+/g, "-");
}

const goalkeeperSeeds: PlayerSeed[] = [
  ["Alisson Becker", "Brazil", 90, "Elite shot stopper"],
  ["Thibaut Courtois", "Belgium", 90, "Dominant reach"],
  ["Gianluigi Donnarumma", "Italy", 89, "Big-match keeper"],
  ["Ederson", "Brazil", 88, "Long-range distributor"],
  ["Marc-André ter Stegen", "Germany", 88, "Calm with the ball"],
  ["Jan Oblak", "Slovenia", 88, "Positioning master"],
  ["Mike Maignan", "France", 88, "Aggressive sweeper"],
  ["Emiliano Martínez", "Argentina", 87, "Penalty specialist"],
  ["Manuel Neuer", "Germany", 87, "Sweeper-keeper pioneer"],
  ["Diogo Costa", "Portugal", 86, "Modern all-rounder"],
  ["Gregor Kobel", "Switzerland", 86, "Reflex wall"],
  ["David Raya", "Spain", 85, "Precise distributor"],
  ["Unai Simón", "Spain", 85, "Reliable organiser"],
  ["Yassine Bounou", "Morocco", 85, "Knockout specialist"],
  ["André Onana", "Cameroon", 84, "Front-foot keeper"],
  ["Wojciech Szczęsny", "Poland", 84, "Experienced guardian"],
  ["Jordan Pickford", "England", 84, "Fast reactions"],
  ["Giorgi Mamardashvili", "Georgia", 84, "Towering presence"],
  ["Aaron Ramsdale", "England", 82, "Energetic stopper"],
  ["Keylor Navas", "Costa Rica", 84, "Champions mentality"],
  ["Dominik Livaković", "Croatia", 83, "Shootout hero"],
  ["Yann Sommer", "Switzerland", 84, "Compact technique"],
  ["Lucas Chevalier", "France", 82, "Rising reflex keeper"],
  ["Anatoliy Trubin", "Ukraine", 82, "High-upside goalkeeper"]
];

const defenderSeeds: PlayerSeed[] = [
  ["Virgil van Dijk", "Netherlands", 90, "Aerial commander"],
  ["Rúben Dias", "Portugal", 89, "Defensive leader"],
  ["William Saliba", "France", 89, "Composed stopper"],
  ["Antonio Rüdiger", "Germany", 88, "Relentless enforcer"],
  ["Marquinhos", "Brazil", 87, "Intelligent organiser"],
  ["Alessandro Bastoni", "Italy", 88, "Progressive centre-back"],
  ["Ronald Araújo", "Uruguay", 87, "Recovery-speed defender"],
  ["Éder Militão", "Brazil", 87, "Explosive marker"],
  ["Joško Gvardiol", "Croatia", 88, "Ball-carrying defender"],
  ["Achraf Hakimi", "Morocco", 89, "Attacking wingback"],
  ["Theo Hernández", "France", 88, "Power runner"],
  ["Trent Alexander-Arnold", "England", 88, "Creative fullback"],
  ["Alphonso Davies", "Canada", 87, "Electric recovery pace"],
  ["John Stones", "England", 86, "Midfield stepping defender"],
  ["Gabriel Magalhães", "Brazil", 87, "Front-foot centre-back"],
  ["Cristian Romero", "Argentina", 87, "Aggressive interceptor"],
  ["Jules Koundé", "France", 87, "Versatile defender"],
  ["Kim Min-jae", "South Korea", 86, "Physical stopper"],
  ["Matthijs de Ligt", "Netherlands", 85, "Powerful organiser"],
  ["Pau Cubarsí", "Spain", 84, "Calm young passer"],
  ["Nuno Mendes", "Portugal", 86, "Rapid overlapping fullback"],
  ["Dani Carvajal", "Spain", 86, "Competitive veteran"],
  ["Dayot Upamecano", "France", 85, "Athletic cover defender"],
  ["Lisandro Martínez", "Argentina", 86, "Fearless ball winner"]
];

const midfielderSeeds: PlayerSeed[] = [
  ["Rodri", "Spain", 92, "Midfield controller"],
  ["Jude Bellingham", "England", 92, "Complete box-to-box star"],
  ["Kevin De Bruyne", "Belgium", 91, "Elite chance creator"],
  ["Federico Valverde", "Uruguay", 89, "High-energy all-rounder"],
  ["Pedri", "Spain", 89, "Press-resistant playmaker"],
  ["Jamal Musiala", "Germany", 90, "Gliding dribbler"],
  ["Martin Ødegaard", "Norway", 89, "Creative captain"],
  ["Declan Rice", "England", 88, "Ball-winning carrier"],
  ["Bruno Fernandes", "Portugal", 89, "Risk-taking creator"],
  ["Bernardo Silva", "Portugal", 89, "Technical controller"],
  ["Florian Wirtz", "Germany", 90, "Final-third artist"],
  ["Vitinha", "Portugal", 88, "Tempo-setter"],
  ["Nicolò Barella", "Italy", 88, "Dynamic midfield engine"],
  ["Frenkie de Jong", "Netherlands", 88, "Press-breaking carrier"],
  ["Joshua Kimmich", "Germany", 87, "Tactical organiser"],
  ["Alexis Mac Allister", "Argentina", 87, "Intelligent connector"],
  ["İlkay Gündoğan", "Germany", 86, "Late-box specialist"],
  ["Eduardo Camavinga", "France", 87, "Elastic ball winner"],
  ["Aurélien Tchouaméni", "France", 87, "Powerful holding midfielder"],
  ["Enzo Fernández", "Argentina", 86, "Progressive passer"],
  ["Hakan Çalhanoğlu", "Turkey", 87, "Deep-lying playmaker"],
  ["Xavi Simons", "Netherlands", 86, "Creative transition threat"],
  ["Dominik Szoboszlai", "Hungary", 86, "Long-range specialist"],
  ["Martín Zubimendi", "Spain", 86, "Positionally smart pivot"]
];

const forwardSeeds: PlayerSeed[] = [
  ["Kylian Mbappé", "France", 93, "Explosive goal threat"],
  ["Erling Haaland", "Norway", 93, "Penalty-box destroyer"],
  ["Vinícius Júnior", "Brazil", 92, "One-on-one specialist"],
  ["Mohamed Salah", "Egypt", 91, "Inside-forward finisher"],
  ["Harry Kane", "England", 91, "Complete number nine"],
  ["Robert Lewandowski", "Poland", 90, "Elite penalty-box movement"],
  ["Lamine Yamal", "Spain", 90, "Fearless creative winger"],
  ["Bukayo Saka", "England", 89, "Reliable right-sided threat"],
  ["Rodrygo", "Brazil", 88, "Big-moment attacker"],
  ["Lautaro Martínez", "Argentina", 90, "Aggressive goal scorer"],
  ["Victor Osimhen", "Nigeria", 89, "Powerful channel runner"],
  ["Khvicha Kvaratskhelia", "Georgia", 89, "Unpredictable dribbler"],
  ["Son Heung-min", "South Korea", 89, "Two-footed finisher"],
  ["Rafael Leão", "Portugal", 88, "Explosive wide forward"],
  ["Antoine Griezmann", "France", 88, "Intelligent second striker"],
  ["Ousmane Dembélé", "France", 88, "Two-footed creator"],
  ["Phil Foden", "England", 89, "Technical goal creator"],
  ["Julián Álvarez", "Argentina", 88, "Relentless pressing forward"],
  ["Alexander Isak", "Sweden", 89, "Smooth complete striker"],
  ["Luis Díaz", "Colombia", 87, "Direct wide attacker"],
  ["Cole Palmer", "England", 89, "Calm final-third creator"],
  ["Cristiano Ronaldo", "Portugal", 89, "Legendary goal scorer"],
  ["Lionel Messi", "Argentina", 91, "Legendary playmaker"],
  ["Neymar", "Brazil", 87, "Flair and invention"]
];

const clamp = (value: number) => Math.max(1, Math.min(99, Math.round(value)));
const variation = (index: number, salt: number) => ((index * 7 + salt * 11) % 7) - 3;

function buildPlayer(seed: PlayerSeed, position: Position, index: number): Footballer {
  const [name, country, seedOverall, trait] = seed;
  const overall = Math.max(seedOverall, FAMOUS_OVR_UPGRADES[name] ?? seedOverall);
  const v = (salt: number) => variation(index, salt);
  const profile = POSITION_PROFILES[name];
  if (!profile) throw new Error(`Missing detailed position profile for ${name}.`);
  const common = {
    id: `${position.toLowerCase()}-${String(index + 1).padStart(2, "0")}`,
    canonicalId: canonicalizeFootballerIdentity(name),
    name,
    photoSearchName: suppliedPhotoById.get(canonicalizeFootballerIdentity(name)) ?? name,
    playerType: "CURRENT" as const,
    country,
    club: "International",
    position,
    secondary: [] as Position[],
    primaryRole: profile.primaryRole,
    secondaryRoles: profile.secondaryRoles,
    overall,
    basePrice: Math.max(12, Math.round((overall - 70) * 2.1)),
    rarity: overall >= 91 ? "Legend" as const : overall >= 86 ? "Elite" as const : "Rising" as const,
    trait,
    isRealPlayer: true
  };

  if (position === "GK") return {
    ...common,
    pace: clamp(45 + v(1)), shooting: clamp(16 + v(2)), passing: clamp(overall - 10 + v(3)),
    dribbling: clamp(48 + v(4)), defending: clamp(35 + v(5)), physical: clamp(overall - 3 + v(6)),
    goalkeeping: clamp(overall + 2)
  };
  if (position === "DEF") return {
    ...common,
    secondary: index % 3 === 0 ? ["MID"] : [],
    pace: clamp(overall - 5 + v(1)), shooting: clamp(overall - 29 + v(2)), passing: clamp(overall - 7 + v(3)),
    dribbling: clamp(overall - 11 + v(4)), defending: clamp(overall + 3 + v(5)), physical: clamp(overall + 1 + v(6)),
    goalkeeping: clamp(9 + v(2))
  };
  if (position === "MID") return {
    ...common,
    secondary: index % 4 === 0 ? ["FWD"] : index % 4 === 1 ? ["DEF"] : [],
    pace: clamp(overall - 5 + v(1)), shooting: clamp(overall - 7 + v(2)), passing: clamp(overall + 3 + v(3)),
    dribbling: clamp(overall + 1 + v(4)), defending: clamp(overall - 14 + v(5)), physical: clamp(overall - 7 + v(6)),
    goalkeeping: clamp(8 + v(2))
  };
  return {
    ...common,
    secondary: index % 4 === 0 ? ["MID"] : [],
    pace: clamp(overall + 1 + v(1)), shooting: clamp(overall + 2 + v(2)), passing: clamp(overall - 8 + v(3)),
    dribbling: clamp(overall + 1 + v(4)), defending: clamp(overall - 52 + v(5)), physical: clamp(overall - 7 + v(6)),
    goalkeeping: clamp(7 + v(2))
  };
}

const BASE_FOOTBALLERS: Footballer[] = [
  ...goalkeeperSeeds.map((seed, index) => buildPlayer(seed, "GK", index)),
  ...defenderSeeds.map((seed, index) => buildPlayer(seed, "DEF", index)),
  ...midfielderSeeds.map((seed, index) => buildPlayer(seed, "MID", index)),
  ...forwardSeeds.map((seed, index) => buildPlayer(seed, "FWD", index))
];

function broadPositionForRole(role: LineupRole): Position {
  if (role === "GK") return "GK";
  if (["LB", "CB", "RB", "LWB", "RWB"].includes(role)) return "DEF";
  if (["CDM", "CM", "CAM", "LM", "RM"].includes(role)) return "MID";
  return "FWD";
}

/**
 * Full-effectiveness dual-primary roles are intentionally limited to players
 * with genuine long-term versatility. Most footballers keep one primary role.
 * The first role remains primaryRole for backwards compatibility.
 */
const POSITION_MODEL_OVERRIDES: Record<string, { primaryRoles: LineupRole[]; secondaryRoles: LineupRole[] }> = {
  "lionel-messi": { primaryRoles: ["RW", "CAM"], secondaryRoles: ["ST", "CF"] },
  "cristiano-ronaldo": { primaryRoles: ["ST", "LW"], secondaryRoles: ["CF"] },
  "neymar": { primaryRoles: ["LW", "CAM"], secondaryRoles: ["ST"] },
  "kylian-mbappe": { primaryRoles: ["ST", "LW"], secondaryRoles: ["RW"] },
  "ruud-gullit": { primaryRoles: ["CM", "CAM"], secondaryRoles: ["CDM", "ST"] },
  "ronaldinho": { primaryRoles: ["LW", "CAM"], secondaryRoles: ["LM"] },
  "pele": { primaryRoles: ["CAM", "ST"], secondaryRoles: ["CF"] },
  "johan-cruyff": { primaryRoles: ["CF", "CAM"], secondaryRoles: ["ST"] },
  "zinedine-zidane": { primaryRoles: ["CAM", "CM"], secondaryRoles: ["LM"] },
  "lothar-matthaus": { primaryRoles: ["CM", "CDM"], secondaryRoles: ["CB"] },
  "franz-beckenbauer": { primaryRoles: ["CB", "CDM"], secondaryRoles: ["CM"] },
  "paolo-maldini": { primaryRoles: ["CB", "LB"], secondaryRoles: [] },
  "joshua-kimmich": { primaryRoles: ["RB", "CDM"], secondaryRoles: ["CM"] },
  "federico-valverde": { primaryRoles: ["CM", "RM"], secondaryRoles: ["RW", "CDM"] },
  "bernardo-silva": { primaryRoles: ["CAM", "RW"], secondaryRoles: ["CM"] },
  "phil-foden": { primaryRoles: ["CAM", "RW"], secondaryRoles: ["LW"] },
  "son-heung-min": { primaryRoles: ["LW", "ST"], secondaryRoles: ["LM"] },
  "trent-alexander-arnold": { primaryRoles: ["RB", "CM"], secondaryRoles: ["CDM", "RWB"] },
  "rodri": { primaryRoles: ["CDM", "CM"], secondaryRoles: [] },
  "jude-bellingham": { primaryRoles: ["CAM", "CM"], secondaryRoles: [] },
  "kevin-de-bruyne": { primaryRoles: ["CAM", "CM"], secondaryRoles: [] },
  "bukayo-saka": { primaryRoles: ["RW", "RM"], secondaryRoles: [] },
  "antoine-griezmann": { primaryRoles: ["CF", "CAM"], secondaryRoles: ["ST"] },
  "wayne-rooney": { primaryRoles: ["CF", "ST"], secondaryRoles: ["CAM"] },
  "andres-iniesta": { primaryRoles: ["CM", "CAM"], secondaryRoles: ["LW"] },
  "steven-gerrard": { primaryRoles: ["CM", "CDM"], secondaryRoles: ["CAM"] },
  "yaya-toure": { primaryRoles: ["CM", "CDM"], secondaryRoles: ["CAM"] },
  "marcelo": { primaryRoles: ["LB", "LWB"], secondaryRoles: ["LM"] },
  "dani-alves": { primaryRoles: ["RB", "RWB"], secondaryRoles: ["RM"] }
};

function applyPositionModel(player: Footballer): Footballer {
  const canonicalId = player.canonicalId ?? canonicalizeFootballerIdentity(player.name);
  const override = POSITION_MODEL_OVERRIDES[canonicalId];
  const primaryRoles = [...new Set(override?.primaryRoles ?? player.primaryRoles ?? [player.primaryRole])].slice(0, 2);
  const safePrimaryRoles = player.position === "GK" ? (["GK"] as LineupRole[]) : primaryRoles.filter(role => role !== "GK");
  const finalPrimaryRoles = safePrimaryRoles.length ? safePrimaryRoles : [player.primaryRole];
  const primarySet = new Set(finalPrimaryRoles);
  const secondaryRoles = [...new Set((override?.secondaryRoles ?? player.secondaryRoles ?? []).filter(role => role !== "GK" && !primarySet.has(role)))];
  const position = broadPositionForRole(finalPrimaryRoles[0]!);
  const secondary = [...new Set([...finalPrimaryRoles.slice(1), ...secondaryRoles].map(broadPositionForRole).filter(item => item !== position))];
  return {
    ...player,
    position,
    secondary,
    primaryRole: finalPrimaryRoles[0]!,
    primaryRoles: finalPrimaryRoles,
    secondaryRoles
  };
}

function buildImportedPlayer(seed: ImportedPlayerSeed, index: number): Footballer {
  const position = broadPositionForRole(seed.primaryRole);
  const v = (salt: number) => variation(index + 97, salt);
  const overall = clamp(seed.overall);
  const common = {
    id: `${seed.playerType === "ICON" ? "icon" : "current"}-${seed.canonicalId}`,
    canonicalId: seed.canonicalId,
    name: seed.name,
    photoSearchName: seed.photoSearchName,
    playerType: seed.playerType,
    country: seed.country,
    club: seed.playerType === "ICON" ? "ICON" : "International",
    position,
    secondary: [...new Set(seed.secondaryRoles.map(broadPositionForRole).filter(item => item !== position))],
    primaryRole: seed.primaryRole,
    secondaryRoles: [...new Set(seed.secondaryRoles.filter(item => item !== seed.primaryRole))],
    overall,
    basePrice: Math.max(12, Math.round((overall - 69) * (seed.playerType === "ICON" ? 2.65 : 2.2))),
    rarity: overall >= 96 ? "Legend" as const : overall >= 89 ? "Elite" as const : "Rising" as const,
    trait: seed.trait,
    isRealPlayer: true
  };
  if (position === "GK") return {
    ...common,
    pace: clamp(48 + v(1)), shooting: clamp(18 + v(2)), passing: clamp(overall - 8 + v(3)),
    dribbling: clamp(50 + v(4)), defending: clamp(38 + v(5)), physical: clamp(overall - 1 + v(6)),
    goalkeeping: clamp(overall + 1)
  };
  if (position === "DEF") return {
    ...common,
    pace: clamp(overall - 4 + v(1)), shooting: clamp(overall - 27 + v(2)), passing: clamp(overall - 5 + v(3)),
    dribbling: clamp(overall - 8 + v(4)), defending: clamp(overall + 2 + v(5)), physical: clamp(overall + v(6)),
    goalkeeping: clamp(8 + v(2))
  };
  if (position === "MID") return {
    ...common,
    pace: clamp(overall - 5 + v(1)), shooting: clamp(overall - 5 + v(2)), passing: clamp(overall + 2 + v(3)),
    dribbling: clamp(overall + 1 + v(4)), defending: clamp(overall - 10 + v(5)), physical: clamp(overall - 5 + v(6)),
    goalkeeping: clamp(7 + v(2))
  };
  return {
    ...common,
    pace: clamp(overall + v(1)), shooting: clamp(overall + 2 + v(2)), passing: clamp(overall - 5 + v(3)),
    dribbling: clamp(overall + 1 + v(4)), defending: clamp(overall - 48 + v(5)), physical: clamp(overall - 5 + v(6)),
    goalkeeping: clamp(6 + v(2))
  };
}

function upgradeExistingPlayer(player: Footballer, catalogue: SuppliedCatalogueEntry): Footballer {
  const targetOverall = Math.max(player.overall, FAMOUS_OVR_UPGRADES[player.name] ?? player.overall);
  const delta = targetOverall - player.overall;
  const boost = (value: number, factor = 1) => clamp(value + delta * factor);
  return {
    ...player,
    canonicalId: catalogue.id,
    photoSearchName: catalogue.photoSearchName,
    playerType: "CURRENT",
    overall: targetOverall,
    pace: boost(player.pace, .65),
    shooting: boost(player.shooting, .8),
    passing: boost(player.passing, .75),
    dribbling: boost(player.dribbling, .75),
    defending: boost(player.defending, .55),
    physical: boost(player.physical, .6),
    goalkeeping: player.position === "GK" ? boost(player.goalkeeping, .9) : player.goalkeeping,
    basePrice: Math.max(player.basePrice, Math.round((targetOverall - 69) * 2.2)),
    rarity: targetOverall >= 96 ? "Legend" : targetOverall >= 89 ? "Elite" : "Rising"
  };
}

const importedById = new Map(CATALOGUE_ADDITIONS.map((seed, index) => [seed.canonicalId, buildImportedPlayer(seed, index)] as const));
const catalogueById = new Map(SUPPLIED_CATALOGUE.map(entry => [entry.id, entry] as const));
const merged = new Map<string, Footballer>();

for (const base of BASE_FOOTBALLERS) {
  const canonicalId = base.canonicalId ?? canonicalizeFootballerIdentity(base.name);
  const catalogue = catalogueById.get(canonicalId);
  merged.set(canonicalId, catalogue ? upgradeExistingPlayer(base, catalogue) : { ...base, canonicalId, playerType: base.playerType ?? "CURRENT" });
}

for (const catalogue of SUPPLIED_CATALOGUE) {
  if (merged.has(catalogue.id)) continue;
  const imported = importedById.get(catalogue.id);
  if (!imported) throw new Error(`Missing Auction Eleven profile for supplied catalogue player ${catalogue.name}.`);
  merged.set(catalogue.id, imported);
}

export const FOOTBALLERS: Footballer[] = [...merged.values()].map(applyPositionModel);
export const FOOTBALLER_BY_ID = new Map(FOOTBALLERS.map(player => [player.id, player]));
export const FOOTBALLER_BY_CANONICAL_ID = new Map(FOOTBALLERS.map(player => [player.canonicalId ?? player.id, player]));
