import type { Footballer, LineupRole, Position } from "@auction-eleven/shared";

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
  const [name, country, overall, trait] = seed;
  const v = (salt: number) => variation(index, salt);
  const profile = POSITION_PROFILES[name];
  if (!profile) throw new Error(`Missing detailed position profile for ${name}.`);
  const common = {
    id: `${position.toLowerCase()}-${String(index + 1).padStart(2, "0")}`,
    name,
    photoSearchName: name,
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

export const FOOTBALLERS: Footballer[] = [
  ...goalkeeperSeeds.map((seed, index) => buildPlayer(seed, "GK", index)),
  ...defenderSeeds.map((seed, index) => buildPlayer(seed, "DEF", index)),
  ...midfielderSeeds.map((seed, index) => buildPlayer(seed, "MID", index)),
  ...forwardSeeds.map((seed, index) => buildPlayer(seed, "FWD", index))
];

export const FOOTBALLER_BY_ID = new Map(FOOTBALLERS.map(player => [player.id, player]));
