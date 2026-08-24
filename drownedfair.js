/* ============================================================
   THE DROWNED FAIR
   A text adventure for scovert.com — S. Covert, 2026.

   The puzzle architecture follows the old two-world grammar: a
   mundane room with a book in it, a magic word that moves you
   between two worlds, a light source you must earn and can waste,
   an animal that clears a hazard, an animal hazard that must be
   bribed, a thing hidden under a floor covering, a locked door
   with a ring of keys, a sleeping man who wants a drink and
   becomes your crew, a vehicle you assemble from six parts and a
   set of plans, a tide you must read, a chart that tells you how
   many paces to walk before you dig, and a room where prizes are
   counted.
   The story, the town, the objects, the prose, the five prizes
   and the scoring are new.

   This file is DOM-free on purpose: the page supplies a printer
   and a status callback through DF.init(). That also lets the
   whole game be driven headlessly by the test suite.
   ============================================================ */
"use strict";
var DF = (function(){

/* ---------- small helpers ---------- */
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function oneOf(a){ return a[(Math.random()*a.length)|0]; }
function listWords(a){
 if(a.length===0) return "nothing";
 if(a.length===1) return a[0];
 return a.slice(0,-1).join(", ")+" and "+a[a.length-1];
}

/* ============================================================
   THE MAP
   world: "town" = Brindley's Amusements, above water, this year.
          "fair" = the Sarnwick pleasure pier, below it, 1911.
   ============================================================ */
var ROOMS = {

/* ---------------- the town ---------------- */
arcade:{
 name:"The Arcade Floor", world:"town",
 flavor:"Brindley's Amusements, shut for the winter.",
 long:"Two rows of dead cabinets face each other down the length of the arcade like "+
      "pews, their screens grey, their coin slots taped over for the season. The carpet "+
      "under them is the deep unnameable red that only ever happens in amusement arcades, "+
      "worn pale in two tracks where forty years of people walked.\n\nThe shutter is down over "+
      "the front, so the only light is the weak brown light of a November afternoon coming "+
      "through the slats, and it lies in stripes across everything. It smells of hot dust "+
      "and old copper.\n\nStairs go up at the back. A doorway leads east to the change booth, "+
      "and the north wall is taken up entirely by the prize wall.",
 exits:{ up:"loft", east:"booth",
         north:{to:"prizewall", flag:"wallOpen",
                fail:"The prize wall is a wall. It doesn't open because you'd like it to."},
         west:{fail:"The shutter is padlocked from the outside, and the key to that is in your uncle's coat, and your uncle is in Peterborough General."} }
},

booth:{
 name:"The Change Booth", world:"town",
 flavor:"A cupboard with a window in it.",
 long:"The change booth is a plywood cupboard with a hole cut in the front and a scoop "+
      "worn into the counter by decades of pushed coins. Whoever last sat here left in a "+
      "hurry, or left slowly over the course of a season, which looks identical afterwards.\n\n"+
      "There is a stool, a dead electric fire, a shelf under the till, and a calendar for "+
      "a year that has been over for some time. The arcade is back to the west.",
 exits:{ west:"arcade" }
},

prizewall:{
 name:"Behind the Prize Wall", world:"town",
 flavor:"The stock nobody ever won.",
 long:"Behind the prize wall is a slot of dead space eighteen inches deep and full of the "+
      "prizes that were never good enough to display: bears with one eye, goldfish bowls "+
      "with no goldfish, a great tangle of plastic beads.\n\nIt is the sort of place that has "+
      "not been swept since before you were born, and the dust here is soft and pale and "+
      "smells faintly of the sea, which is odd, because you are three streets from the sea. "+
      "The arcade is back through the gap to the south.",
 exits:{ south:"arcade" }
},

loft:{
 name:"The Loft", world:"town",
 flavor:"Everything that was too good to throw out.",
 long:"The loft runs the whole length of the building and is stacked to the rafters with "+
      "the things a family business cannot bear to skip: signage for prices that no longer "+
      "exist, a rolled banner, crates of spare glass, a bicycle.\n\nThe floorboards give under "+
      "you in a way you decide not to think about. At the east end a sash window stands "+
      "open onto the fire escape, and the cold comes through it in a solid slab. The stairs "+
      "go back down.",
 exits:{ down:"arcade", east:{to:"landing", check:"landing"} }
},

landing:{
 name:"The Fire Escape Landing", world:"town",
 flavor:"Wet iron, four storeys up.",
 long:"You are standing on a grating of wet black iron bolted to the back of the building, "+
      "four storeys above a yard full of bins. The rail is furred with rust and comes away "+
      "in orange flakes when you touch it.\n\nFrom here you can see the promenade, the shut "+
      "kiosks, the flat grey plate of the sea, and — a quarter mile out and a hundred and "+
      "fifteen years down — nothing at all, which is where the pier used to be. The window "+
      "back into the loft is west.",
 exits:{ west:"loft" }
},

/* ---------------- the fair ---------------- */
shingle:{
 name:"The Shingle", world:"fair",
 flavor:"Under the pier, at the landward end.",
 long:"You are standing on wet shingle in the long striped shade under the pier, and the "+
      "pier is standing, which it has not done since 1911.\n\nAbove you the ironwork goes out "+
      "over the water in a perspective of arches, dripping, hung with weed, printing bars "+
      "of light and dark across the stones.\n\nThe sea is north and is doing almost nothing. "+
      "The dunes are east. To the south the shingle gives way to a shallow lagoon between "+
      "two of the great iron legs.",
 exits:{ north:{to:"sea", check:"sea"}, east:"dunes",
         south:{to:"lagoon", check:"gulls"} }
},

sea:{
 name:"The Sea", world:"fair",
 flavor:"Out of your depth.",
 long:"Grey-green water, cold enough to make your chest lock, going up and down without "+
      "any real interest in you. The pier is a black comb against the sky to the south.",
 exits:{ north:"shingle", south:"shingle", east:"shingle", west:"shingle", down:"shingle", up:"shingle" }
},

lagoon:{
 name:"The Lagoon", world:"fair",
 flavor:"A shallow pool between the pier legs.",
 long:"Between two of the pier's iron legs the shingle dips into a lagoon perhaps thirty "+
      "feet across, floored with ribbed sand and fringed with bladderwrack.\n\nIt fills and "+
      "empties twice a day, and everything the sea has ever thought about throwing away "+
      "eventually turns up in it. The shingle is north.",
 exits:{ north:"shingle" }
},

dunes:{
 name:"The Dunes", world:"fair",
 flavor:"Marram grass and blown sand.",
 long:"Low dunes, held together by marram grass that hisses continuously in the wind and "+
      "cuts you if you grab it. Sand has blown into long combs across a boardwalk that was "+
      "clearly laid here by somebody optimistic.\n\nThe shingle is west, a bathing hut stands "+
      "north, and eastward the ground rises to the foot of the helter skelter.",
 exits:{ west:"shingle", north:"bathinghut", east:"skelterfoot" }
},

bathinghut:{
 name:"The Bathing Hut", world:"fair",
 flavor:"Blue and white stripes, mostly white now.",
 long:"A bathing hut of tongue-and-groove board, painted in blue and white stripes that "+
      "the salt has taken most of the blue out of. Inside there is just room to stand, "+
      "turn around, and regret it.\n\nThere is a bench, a hook, a strong smell of creosote "+
      "and a stronger one of low tide. The dunes are south.",
 exits:{ south:"dunes" }
},

skelterfoot:{
 name:"The Foot of the Helter Skelter", world:"fair",
 flavor:"A tower of white boards and a spiral slide.",
 long:"The helter skelter goes up from here in a fat white spiral, sixty feet of "+
      "tongue-and-groove wrapped round a wooden tower, with a slide winding down the "+
      "outside of it polished to a shine by a million hessian mats.\n\nA stair inside the "+
      "tower goes up. At the base, where the tower is built into the rising ground, a "+
      "square black opening leads down into the ghost train tunnels. The dunes are west.",
 exits:{ up:"skeltertop", down:"ghost1", west:"dunes" }
},

skeltertop:{
 name:"The Top of the Helter Skelter", world:"fair",
 flavor:"Sixty feet up, and the wind knows it.",
 long:"From the little shingled cap at the top of the tower you can see the whole of it: "+
      "the pier running out beneath you strung with four hundred coloured bulbs, the "+
      "ballroom's glass dome at the far end, the dunes, the lagoon, the promenade with its "+
      "hotels.\n\nAnd out east across a mile of water — close enough to see, too far to swim — "+
      "a low pale line of sand with something turning slowly on it.\n\nThat is the sandbar. "+
      "Whatever is out there is out there. The stair goes back down.",
 exits:{ down:"skelterfoot" }
},

ghost1:{
 name:"The Ghost Train Tunnels", world:"fair", dark:true, maze:true,
 flavor:"Painted dark, and dark.",
 long:"A low tunnel with rails in the floor, everything inside it painted the particular "+
      "flat black that is meant to stop you seeing the joins.",
 lit:"By the light you are carrying: a tunnel with rails in the floor and a papier-mâché "+
     "skeleton on the left wall, one arm up, hinged at the shoulder so that it swung out "+
     "at the cars as they passed. It is not swinging now. Openings go off in every "+
     "direction, a stair climbs back up, and there is a gap in the floor going down.",
 exits:{ north:"ghost2", south:"ghost3", east:"ghost1", west:"ghost4", up:"skelterfoot", down:"pit" }
},
ghost2:{
 name:"The Ghost Train Tunnels", world:"fair", dark:true, maze:true,
 flavor:"Painted dark, and dark.",
 long:"A low tunnel with rails in the floor, everything inside it painted the particular "+
      "flat black that is meant to stop you seeing the joins.",
 lit:"By the light you are carrying: a tunnel with rails in the floor, and a great sagging "+
     "curtain of rotted felt hanging across one opening, cut into strips so the cars could "+
     "push through it. Every strip is furred white with salt.",
 exits:{ north:"ghost3", south:"ghost1", east:"ghost4", west:"ghost2", down:"ghost3" }
},
ghost3:{
 name:"The Ghost Train Tunnels", world:"fair", dark:true, maze:true,
 flavor:"Painted dark, and dark.",
 long:"A low tunnel with rails in the floor, everything inside it painted the particular "+
      "flat black that is meant to stop you seeing the joins.",
 lit:"By the light you are carrying: a tunnel with rails in the floor, and a ghost train "+
     "car stopped dead across them, tipped over on one side. Its painted eyes are on the "+
     "front. Somebody's hat is still on the seat.",
 exits:{ north:"ghost1", south:"ghost4", east:"ghost2", west:"ghost3", up:"ghost2" }
},
ghost4:{
 name:"The Ghost Train Tunnels", world:"fair", dark:true, maze:true,
 flavor:"Painted dark, and dark.",
 long:"A low tunnel with rails in the floor, everything inside it painted the particular "+
      "flat black that is meant to stop you seeing the joins.",
 lit:"By the light you are carrying: a tunnel with rails in the floor, and a doorway to "+
     "the north with a proper stone lintel over it — not fairground work at all, but the "+
     "real structure of the pier. Cold air comes through it.",
 exits:{ north:"colonnade", south:"ghost2", east:"ghost3", west:"ghost1" }
},

pit:{
 name:"The Empty Diving Pool", world:"fair",
 flavor:"Twelve feet deep, and dry.",
 long:"You are standing on the tiled floor of a diving pool with no water in it, which is "+
      "a strange thing to be doing anywhere and a stranger one under a pier.\n\nThe tiles are "+
      "white with a blue line at the top, and the sides go up smooth and sheer to a "+
      "diving board twelve feet above you, and there is a ladder, thank God. Things have "+
      "collected down here the way things collect in the bottom of anything.",
 exits:{ up:"ghost1" }
},

colonnade:{
 name:"The Colonnade", world:"fair",
 flavor:"The pier's own bones, below the deck.",
 long:"This is the pier itself and not the fair on top of it: a long service colonnade "+
      "running out under the deck, iron columns down both sides, the sea sliding past in "+
      "the gaps between the boards overhead in flashes of grey.\n\nIt is cold and it echoes "+
      "and it goes on further than you can see. A green-painted door is set into the north "+
      "wall. Eastward the colonnade opens out into something much larger. The way back is "+
      "south.",
 exits:{ south:"ghost4", east:"ballroom",
         north:{to:"fitters", flag:"doorOpen",
                fail:"The green door is locked, in the wholehearted way that doors were locked when people expected them to last."} }
},

fitters:{
 name:"The Fitter's Hut", world:"fair",
 flavor:"Sawdust, oil, and somebody's system.",
 long:"The fitter's hut is a plank room ten feet square with a bench down one side and a "+
      "rack of tools above it, each tool with its own painted silhouette on the board "+
      "behind, so that anything missing is missing loudly.\n\nAlmost nothing is missing. "+
      "Whoever worked here worked here for thirty years and expected to come back on the "+
      "Monday. The colonnade is south.",
 exits:{ south:"colonnade" }
},

ballroom:{
 name:"The Ballroom", world:"fair", dark:true,
 flavor:"Under the glass dome at the pier head.",
 long:"You are in a very large dark room. There is an enormous amount of it. Your "+
      "footsteps go out and come back changed.",
 lit:"By the light you are carrying: the ballroom of the Sarnwick pier, under its glass "+
     "dome, and the dome is intact.\n\nTwo hundred feet of sprung maple floor, laid in a "+
     "spiral, with the tide moving in a slow sheet across the far end of it. Gilt chairs "+
     "are stacked along the walls in towers. The bandstand is at the north end with the "+
     "music still on the stands.\n\nAnd all around the edge of the floor, in pieces, lies the "+
     "carousel — the whole ride, dismantled and stacked for the winter, the way it always "+
     "was in November. The colonnade is west.",
 exits:{ west:"colonnade" }
},

deck:{
 name:"Aboard the Marigold", world:"fair",
 flavor:"A pleasure boat, rebuilt, afloat.",
 long:"The Marigold is thirty feet of clinker-built pleasure boat with a paddle box on "+
      "each side and a canvas awning over the after half, and she is floating, which an "+
      "hour ago seemed unlikely.\n\nThere is a wheel, a compass, a coil of rope, and rather "+
      "more water in the bottom than you would choose. You can get ashore easily enough.",
 exits:{ down:{to:"@shore"}, west:{to:"@shore"}, out:{to:"@shore"} }
},

sandbar:{
 name:"The Sandbar", world:"fair",
 flavor:"A mile out, and dry at low water.",
 long:"The sandbar is a long low island of pale ribbed sand, a mile out from the pier and "+
      "only here at all for a few hours either side of low water. Standing on it feels "+
      "like standing on something's back.\n\nThere are things on it that the sea has been "+
      "bringing here for a hundred and fifteen years and stacking up above the tideline: "+
      "the fair, or as much of the fair as floats.\n\nA field of it lies east. Something "+
      "glitters westward. The Marigold is drawn up at the water's edge.",
 exits:{ east:"carouselfield", west:"bulbfield" }
},

carouselfield:{
 name:"The Carousel Field", world:"fair",
 flavor:"Flat sand, and one horse standing.",
 long:"A wide flat field of hard ribbed sand, wet enough to hold a footprint and dry "+
      "enough to walk on, running to the horizon in every direction with nothing on it "+
      "at all — except, alone in the middle of it and standing perfectly upright as though "+
      "somebody had set it down carefully and gone to get the rest, a single carousel "+
      "horse. A galloper. White, with a gilt mane, and one glass eye left.\n\nThe sandbar is "+
      "west and the ruin of a great glasshouse stands north.",
 exits:{ west:"sandbar", north:"wintergardens" }
},

bulbfield:{
 name:"The Bulb Graveyard", world:"fair",
 flavor:"Four hundred lights, all of them out.",
 long:"The tide has spent a century sorting the wreck by weight, and this is where it put "+
      "the light bulbs: a drift of them a foot deep and forty feet long, coloured glass, "+
      "the old fat carbon-filament kind, ground by the sea into something between a shingle "+
      "and a jewellery box.\n\nIt is beautiful and it crunches horribly and you cannot walk "+
      "on it without feeling that you are doing something wrong. The sandbar is east.",
 exits:{ east:"sandbar" }
},

wintergardens:{
 name:"The Burnt Winter Gardens", world:"fair",
 flavor:"A glasshouse with no glass.",
 long:"The winter gardens were a glasshouse two hundred feet long, and what is left is the "+
      "iron: ribs, purlins, the curved skeleton of a roof, standing in the sand and going "+
      "quietly orange. Everything soft burned. Everything green died the same winter.\n\nIn "+
      "amongst it stands the wreck of the fairground organ, an enormous carved thing "+
      "twelve feet high with a painted front of dancing figures, still, somehow, painted. "+
      "The field is south.",
 exits:{ south:"carouselfield" }
},

lostproperty:{
 name:"The Lost Property Office", world:"limbo",
 flavor:"Everything that ever went missing at the seaside.",
 long:"You are in a small municipal office with a high counter, a bell, and shelves going "+
      "back further than the room. On the shelves are umbrellas, spectacles, single shoes, "+
      "a great many hats, a stuffed heron, and one bicycle. Behind the counter a clerk in a "+
      "cardigan looks up at you with the mild patience of a man for whom this is Tuesday.\n\n"+
      "\"You'll be wanting to go back,\" he says. It isn't really a question.",
 exits:{}
}
};

/* ============================================================
   THE THINGS
   loc: a room key | "PLAYER" | "GONE" | "IN:<objid>"
   ============================================================ */
var OBJ = {

/* ---- the town ---- */
cabinet:{ name:"glass prize cabinet", words:["cabinet","case","showcase"], adj:["glass","prize"],
 loc:"arcade", fixed:true, container:true, open:true, scenery:true,
 initial:"The prize cabinet stands against the end wall — six feet of glass shelving, lit "+
   "from inside once, empty now except for a card that says PRIZES.",
 examine:"A glass case with brass corners and a lock that hasn't worked since the sixties. "+
   "The shelves are lined with faded felt and there are five ring-marks in the dust where "+
   "five things used to stand. A card in the bottom of it reads, in copperplate: "+
   "\"RETURN PRIZES TO THE CABINET. THEN SAY SCORE.\"" },

notice:{ name:"notice by the stairs", words:["notice","sign","notices"], adj:["stairs"],
 loc:"arcade", fixed:true, scenery:true,
 examine:"A small enamel notice screwed to the wall at the foot of the stairs, of the kind "+
   "that used to be everywhere and meant something once:\n\n"+
   "    TO PUT OUT A LIGHT, ASK FOR THE OPPOSITE OF LIGHT.\n\n"+
   "Underneath, in pencil, in a much later hand: \"it works, sam — h.b.\"" },

machines:{ name:"dead cabinets", words:["cabinets","machines","machine","arcade"], adj:["dead","old"],
 loc:"arcade", fixed:true, scenery:true,
 examine:"Two rows of them, unplugged: a Penny Falls, three fruit machines, a crane grab "+
   "with one soft toy left in the corner of it, and at the end, under a dust sheet, "+
   "something with a wooden cabinet and a bakelite fascia that predates all the rest of it "+
   "by fifty years. You lift the sheet. It is a What The Butler Saw. You put the sheet back." },

ledger:{ name:"water-stained ledger", short:"ledger", words:["ledger","book","register"],
 adj:["water-stained","stained","water","old"], loc:"booth", size:1,
 initial:"A water-stained ledger has been left open on the shelf under the till, as though "+
   "somebody was called away in the middle of a line.",
 desc:"A water-stained ledger.",
 examine:"A tall thin ledger bound in green cloth, swollen along the bottom edge where it "+
   "has been wet and dried and wet again. The columns are for a business that took money in "+
   "pennies. You could read it properly if you liked.",
 read:"You read the ledger.\n\n"+
   "It is the prize book of the Sarnwick Pier Company for the season of 1911: every prize "+
   "bought in, every prize given out, ruled off weekly in a hand that gets tighter as the "+
   "year goes on. The last page is dated the ninth of December and is ruled off in a hand "+
   "that is not tight at all. Under it somebody has written:\n\n"+
   "    \"Five prizes not redeemed. They are down there with the rest of it.\n"+
   "     A. Vane knows and A. Vane says the sea can have them.\n"+
   "     It cannot have them. Say the word and go and get them.\"\n\n"+
   "In the flyleaf, in ink, pressed hard enough to emboss the board underneath, is a single "+
   "word: HOOPLA." },

plimsolls:{ name:"pair of rubber plimsolls", short:"plimsolls", words:["plimsolls","plimsoll","pumps","shoes","sneakers"],
 adj:["rubber","black"], loc:"booth", size:1, wearable:true,
 initial:"A pair of black rubber plimsolls sits under the stool, toes together, as though "+
   "somebody meant to be back.",
 desc:"A pair of rubber plimsolls.",
 examine:"Black rubber gym shoes with a herringbone sole, worn but sound. The sort of thing "+
   "that grips wet iron. There is a name inked inside the left one, gone illegible." },

chips:{ name:"paper of chips", short:"chips", words:["chips","chip","paper","bag"], adj:["paper","cold","greasy"],
 loc:"booth", size:1,
 initial:"Somebody's chips are sitting on the counter, wrapped in newspaper, entirely cold.",
 desc:"A paper of cold chips.",
 examine:"Cold chips in newspaper, a day old, gone the pale grey of a thing that will never "+
   "be eaten by a person. There is a great deal of salt on them. They smell, honestly, "+
   "quite good.",
 edible:"You are not that hungry, and you have a strong feeling those are spoken for." },

flare:{ name:"naphtha flare", short:"flare", words:["flare","lamp","lantern","light","naphtha"],
 adj:["naphtha","brass","unlit","lit"], loc:"prizewall", size:2,
 initial:"Standing on end in the corner, brass and dented, is a naphtha flare — the kind "+
   "of open lamp that lit every fairground in England before the electric came.",
 desc:"A naphtha flare.",
 examine:function(){ return F.flareLit
   ? "The flare is burning: a flat yellow leaf of flame a foot high, roaring gently, "+
     "throwing a hot unsteady light and a smell like a chip shop and a foundry combined. "+
     "It is using itself up while you look at it."
   : "A brass naphtha flare with a bell top and a screw reservoir. There is fuel in it — "+
     "you can hear it move. It wants a match."; } },

matches:{ name:"box of matches", short:"matches", words:["matches","match","box","matchbox"],
 adj:["box","wax","dry"], loc:"loft", size:1,
 initial:"A box of wax matches sits on a crate, dry as a bone under the eaves.",
 desc:"A box of matches.",
 examine:"Wax vestas in a wooden box, kept dry by luck and altitude. Perhaps thirty left. "+
   "The label shows a lighthouse." },

stout:{ name:"bottle of stout", short:"stout", words:["stout","bottle","beer","ale"], adj:["brown","bottle"],
 loc:"loft", size:1,
 initial:"A single bottle of stout stands on the sill, brown and unopened and gathering "+
   "dust with tremendous patience.",
 desc:"A bottle of stout.",
 examine:"A brown bottle with a ceramic swing stopper, unopened, the label mostly gone. "+
   "What is left of it says SARNWICK. It is not, you suspect, still nice. It is, you "+
   "suspect, still beer.",
 edible:"You are on duty, in a manner of speaking." },

lifering:{ name:"cork life-ring", short:"life-ring", words:["life-ring","lifering","ring","lifebuoy","buoy","preserver"],
 adj:["cork","life","white"], loc:"landing", size:2, wearable:true,
 initial:"A cork life-ring hangs on a hook by the rail, painted white a long time ago, with "+
   "BRINDLEY'S stencilled round it in letters that have run.",
 desc:"A cork life-ring.",
 examine:"A ring of cork bound in canvas and painted, heavy, and buoyant in the way that "+
   "only cork is buoyant — it does not want to go down and it will argue about it. "+
   "You could wear it." },

/* ---- the fair ---- */
starling:{ name:"starling", words:["starling","bird","sturnus"], adj:["small","speckled"],
 loc:"bathinghut", size:1, animate:true,
 initial:"A starling is sitting on the hook, quite unbothered by you, turning its head to "+
   "keep one eye on you at a time.",
 desc:"A starling.",
 examine:"A starling: black at a distance, and at this distance not black at all but "+
   "green and purple and spattered with white points like a night sky drawn by somebody in "+
   "a hurry. It watches you with the specific insolence of a bird that has decided you are "+
   "not dangerous. Starlings can say things. This one, it turns out, does." },

mat:{ name:"rolled coconut mat", short:"mat", words:["mat","matting","coconut","coir"], adj:["rolled","coconut","coir"],
 loc:"bathinghut", size:2,
 initial:"A coconut mat has been rolled up and stood on end in the corner.",
 desc:"A rolled coconut mat.",
 examine:"Coarse coir matting, rolled and tied with string, the sort they put down at the "+
   "top of a helter skelter so you have something to sit on. It is stiff with salt. It has "+
   "clearly been standing there a long time, and the floor under it will not have seen "+
   "daylight in a century." },

keys:{ name:"ring of keys", short:"keys", words:["keys","key","ring","keyring"], adj:["ring","iron","rusty"],
 loc:"GONE", size:1,
 desc:"A ring of keys.",
 examine:"Eleven iron keys on a split ring, each with a paper tag, each tag gone to pulp "+
   "except one, which reads GREEN DR. in indelible pencil." },

chest:{ name:"sea-chest", words:["chest","sea-chest","seachest","trunk","box"], adj:["sea","wooden","banded","locked"],
 loc:"bathinghut", fixed:true, container:true, open:false, locked:true, keyid:"keys",
 initial:"A sea-chest is pushed under the bench, banded in iron and unmistakably locked.",
 examine:function(){ return F.chestOpen
   ? "A sea-chest, open, its lid back against the wall. It is lined with tarred paper and "+
     "smells of pitch."
   : "A sea-chest of oak and iron, three feet long. The lid is shut and there is a keyhole "+
     "under the hasp and no key in it. It does not rattle when you shake it. It thumps."; } },

plans:{ name:"set of plans", short:"plans", words:["plans","plan","drawing","drawings","blueprint"],
 adj:["set","folded","builder's"], loc:"IN:chest", size:1,
 desc:"A set of plans.",
 examine:"Four sheets of linen-backed drawing, folded in quarters, and still crisp.",
 read:"They are the builder's drawings for a thirty-foot clinker pleasure boat, the "+
   "Marigold, of the Sarnwick Pier Company. Every part is called out on the sheet in a "+
   "draughtsman's capitals, and there are six of them:\n\n"+
   "    HAMMER. SCREWS. PLANKING. ANCHOR. AWNING. PADDLE WHEEL.\n\n"+
   "At the bottom, in the same hand: \"She will want two aboard her. One to steer and one "+
   "to know where.\"" },

boatman:{ name:"sleeping boatman", short:"boatman", words:["boatman","man","sleeper","fellow"],
 adj:["sleeping","old","asleep"], loc:"bathinghut", fixed:true, animate:true,
 initial:"An old boatman is asleep on the bench with his cap over his face and his boots "+
   "crossed at the ankle, in the manner of a man who has done this before and expects to "+
   "do it again.",
 desc:function(){ return F.boatmanAwake
   ? "The boatman has come along with you, and stands about with his hands in his pockets, waiting on the tide and on you."
   : "The boatman is asleep on the bench."; },
 examine:function(){ return F.boatmanAwake
   ? "He is about seventy and built like a bollard, and he watches the water while he "+
     "talks to you, which is not rudeness but habit. He has your bottle in his pocket, "+
     "empty, and no intention of giving it back."
   : "He is fast asleep and going nowhere. A brass button on his jersey reads SARNWICK "+
     "PIER CO. He is not cold and he is not wet and by any reasonable account he is not "+
     "possible. His hand is curled as though something ought to be in it."; } },

awning:{ name:"canvas awning", short:"awning", words:["awning","canvas","cover","sail"], adj:["canvas","striped","folded"],
 loc:"bathinghut", size:2,
 initial:"A striped canvas awning is folded on the bench, neat as a flag.",
 desc:"A folded canvas awning.",
 examine:"Heavy striped duck canvas with brass eyelets and a bolt rope, folded by somebody "+
   "who knew how. Dry, sound, and about the size of a small room when it isn't folded." },

anchor:{ name:"rusty anchor", short:"anchor", words:["anchor","hook","grapnel"], adj:["rusty","small","iron"],
 loc:"pit", size:3,
 initial:"A small rusty anchor lies in the corner where the deep end used to be, having "+
   "arrived by means you would rather not reconstruct.",
 desc:"A rusty anchor.",
 examine:"A stocked anchor about three feet long, orange with rust all over and pitted "+
   "deeply on the flukes. Heavy. Genuinely heavy. You will feel this one in your back." },

hammer:{ name:"claw hammer", short:"hammer", words:["hammer","mallet"], adj:["claw","heavy"],
 loc:"fitters", size:1,
 initial:"A claw hammer hangs on the rack, dead centre of its painted silhouette.",
 desc:"A claw hammer.",
 examine:"An ash-handled claw hammer with a head polished silver on the face and black "+
   "everywhere else. It sits in the hand like it was measured for you, which is what "+
   "thirty years of somebody else's hand does to a handle." },

screws:{ name:"box of brass screws", short:"screws", words:["screws","screw","brass","fixings","nails"],
 adj:["brass","box"], loc:"fitters", size:1,
 initial:"A japanned tin of brass screws sits on the bench, sorted by length.",
 desc:"A box of brass screws.",
 examine:"Brass countersunk screws, several hundred, sorted by length into compartments "+
   "with a card label for each. Brass because iron rusts and this is a boat. Somebody "+
   "here knew what they were doing." },

planking:{ name:"stack of planking", short:"planking", words:["planking","planks","plank","wood","lumber","timber","boards"],
 adj:["stack","larch","cut"], loc:"fitters", size:3,
 initial:"A stack of cut larch planking is racked under the bench, each piece numbered in "+
   "chalk.",
 desc:"A stack of planking.",
 examine:"Larch, cut to shape, numbered one to forty in chalk, and racked in order. This is "+
   "not a pile of wood. This is a boat that has not been assembled yet." },

spade:{ name:"spade", words:["spade","shovel"], adj:["long-handled","steel"],
 loc:"fitters", size:2,
 initial:"A long-handled spade leans in the corner.",
 desc:"A spade.",
 examine:"A steel spade with a long ash handle, the blade worn to a bright crescent along "+
   "the edge. Made for sand." },

paddlewheel:{ name:"paddle wheel", short:"paddle wheel", words:["wheel","paddle","paddlewheel"],
 adj:["paddle","spare","slatted"], loc:"ballroom", size:3,
 initial:"A spare paddle wheel is leaning against the bandstand, slatted like a water mill.",
 desc:"A paddle wheel.",
 examine:"Six feet across, elm slats bolted between two iron rings, made to be hung on a "+
   "shaft and turned. It is the only thing in this room that was never meant to be looked "+
   "at, which is why it has lasted." },

boltedmat:{ name:"dance mat", words:["mat","matting","dancemat"], adj:["dance","bolted","big"],
 loc:"ballroom", fixed:true, scenery:true,
 examine:"A great sheet of matting laid across the floor at the ballroom door to keep the "+
   "sand off the maple. You get a corner up. Under it: maple. You feel around further. "+
   "More maple.",
 under:"It is bolted down through brass grommets every foot along its length, and the "+
   "bolts go into the deck, and the deck is two inches of sprung maple. It is not hiding "+
   "anything. It is doing its job." },

galloper:{ name:"gilded galloper's head", short:"galloper's head", words:["head","galloper","horse","carving"],
 adj:["gilded","gilt","carved","carousel","wooden"], loc:"ballroom", size:2,
 treasure:true, points:25,
 initial:"Amongst the dismantled carousel, propped upright on a gilt chair and facing the "+
   "door as though it had been put there to see who came in, is the carved head of a "+
   "galloper.",
 desc:"The gilded galloper's head.",
 examine:"Lime wood, carved by hand, gilded and then painted over the gilding and then "+
   "worn back through the paint to the gold by a hundred thousand children holding on. "+
   "The mane is cut in the deep spiral that only one workshop in England ever cut. The "+
   "eye is glass and it is looking at you and it will not stop." },

gulls:{ name:"herring gulls", short:"gulls", words:["gulls","gull","birds","seagulls","seagull"],
 adj:["herring","enormous"], loc:"shingle", fixed:true, animate:true,
 initial:"A dozen herring gulls hold the mouth of the lagoon to the south, standing about "+
   "in the shallows with the flat confidence of a gang on a corner.",
 desc:"A dozen herring gulls hold the lagoon to the south.",
 examine:"Herring gulls, each the size of a well-fed cat, standing in four inches of water "+
   "and looking at you along their beaks. One of them opens its wings, unhurriedly, to show "+
   "you how much room it takes up. They are not frightened of you. They have never once, "+
   "in the whole history of their species, been frightened of you." },

bottle:{ name:"stoppered bottle", short:"bottle", words:["bottle","flask"], adj:["stoppered","green","sealed"],
 loc:"lagoon", size:1, container:true, open:false, hidden:false,
 initial:"A stoppered green bottle is lying on its side in the ribbed sand, well up the pool, where the last tide but one put it.",
 desc:"A stoppered bottle.",
 examine:"Green glass, sealed with a cork and a skin of wax gone the colour of a fingernail. "+
   "There is something rolled up inside it. This is, you are aware, the single most "+
   "clichéd object in the world, and you would still be furious if it turned out to be empty." },

chart:{ name:"chart", words:["chart","map"], adj:["rolled","linen"], loc:"IN:bottle", size:1,
 desc:"A chart.",
 examine:"A hand-drawn chart on linen, rolled tight, showing the pier, the bar, and the "+
   "channel between.",
 read:"It is a working chart of Sarnwick bar, hand-drawn, with the channel sounded in "+
   "fathoms and the safe water inked in blue. Somebody has added, later, in a different "+
   "ink, a small drawing of a horse standing alone on the sand, and beside it:\n\n"+
   "    \"From the standing horse: forty paces, and then dig.\"" },

helmet:{ name:"brass diving helmet", short:"diving helmet", words:["helmet","brass","diving","hardhat"],
 adj:["brass","diving","copper"], loc:"lagoon", size:3, treasure:true, points:20,
 initial:"Half-buried in the ribbed sand, with the water just off it, is a brass diving "+
   "helmet.",
 desc:"A brass diving helmet.",
 examine:"A twelve-bolt diving helmet in brass and tinned copper, the front light glazed "+
   "and unbroken, the neck ring green with a century of verdigris. There is a name "+
   "engraved on the brow: J. TREVENNICK. It weighs what a small child weighs and it is "+
   "the most beautiful object you have ever put your hands on.",
 hidden:true },

marigold:{ name:"Marigold", words:["marigold","boat","launch","steamer"], adj:["pleasure","clinker"],
 loc:"GONE", fixed:true,
 desc:"The Marigold lies at the water's edge.",
 examine:"Thirty feet of clinker-built pleasure boat, larch on oak, a paddle box each side "+
   "and a striped awning over the after half. Freshly assembled and, against every "+
   "expectation, tight." },

standinghorse:{ name:"standing horse", short:"horse", words:["horse","galloper","carousel"], adj:["standing","white","single"],
 loc:"carouselfield", fixed:true, scenery:true,
 examine:"A carousel horse standing upright in the middle of a mile of empty sand, its "+
   "brass pole gone, balanced on its own four hooves as though it had walked here. White, "+
   "with a gilt mane, and one glass eye. The sand has not drifted against it. It is not "+
   "sinking. It is just standing, in the middle of the field, facing east." },

organ:{ name:"fairground organ", short:"organ", words:["organ","fairground"], adj:["fairground","carved","great"],
 loc:"wintergardens", fixed:true, scenery:true,
 examine:"Twelve feet of carved and painted front — caryatids, a conductor with a hinged "+
   "arm, two dancing girls, a great deal of gilding — and behind it, ranks of wooden pipes, "+
   "a bellows, and the book of folded card that used to be fed through it. Everything "+
   "wooden is ruined. Everything metal is not." },

organpipe:{ name:"silver organ pipe", short:"organ pipe", words:["pipe","organpipe"],
 adj:["silver","tall","polished","organ"], loc:"wintergardens", size:2, treasure:true, points:20,
 initial:"One pipe stands clear of the ruin of the organ, four feet of it, and it is not "+
   "wood and it is not tarnished.",
 desc:"A silver organ pipe.",
 examine:"Four feet of spun silver, the front rank's biggest pipe, made by a firm in "+
   "Waldkirch for a man who wanted the loudest fair on the south coast and got it. There "+
   "is not a mark on it. When you tilt it, it hums." },

wasps:{ name:"wasps", words:["wasps","wasp","nest","swarm"], adj:["swarm","angry"],
 loc:"wintergardens", fixed:true, animate:true,
 initial:"A nest the size of a football hangs in the iron ribs, and the air below it is "+
   "busy in a way that stops you where you stand.",
 desc:"The wasps are working the ruin over.",
 examine:"A grey paper nest, layered like something turned on a lathe, and a hundred wasps "+
   "going in and out of it in a steady two-way stream. They are between you and the organ. "+
   "They have not decided about you yet." },

tinbox:{ name:"japanned tin box", short:"tin box", words:["tin","box","tinbox","case"],
 adj:["japanned","black","small","tin"], loc:"wintergardens", size:1,
 container:true, open:false,
 initial:"A small black japanned tin box sits on a ledge of ironwork, above the reach of "+
   "the tide, put there on purpose.",
 desc:"A japanned tin box.",
 examine:function(){ return F.tinOpen
   ? "A japanned tin box, open, empty, its hinge still working sweetly."
   : "A japanned tin box six inches by four, black with a gold line round it, of the kind "+
     "people kept documents in. There is no lock, only a catch. It is dry inside. You can "+
     "tell, because it doesn't slosh, and everything else here does."; } },

brassring:{ name:"brass ring", words:["ring","brassring"], adj:["brass","carousel","gold"],
 loc:"IN:tinbox", size:1, treasure:true, points:20,
 desc:"A brass ring.",
 examine:"A plain brass ring an inch and a half across, worn smooth and slightly oval by "+
   "being grabbed at.\n\nThis is the ring: the one they hung on an arm beside the carousel so "+
   "that the rider on the outside could snatch at it going past, and the one who caught it "+
   "rode again for nothing.\n\nEvery fair had one. This one is the Sarnwick one, and there is "+
   "a paper with it that says so, and the paper says it was never won." },

pennies:{ name:"jar of old pennies", short:"jar of pennies", words:["jar","pennies","penny","coins","money"],
 adj:["old","stone","jar"], loc:"GONE", size:2, treasure:true, points:15,
 desc:"A jar of old pennies.",
 examine:"A stoneware jar, sealed with wax, absolutely crammed with pennies — the great "+
   "heavy Victorian ones, worn nearly smooth, the takings of a machine that gave people "+
   "back a fraction of what they put in. It is the takings of the whole last week, and it "+
   "weighs like a brick, and somebody buried it rather than bank it." },

bulbs:{ name:"drift of bulbs", words:["bulbs","bulb","glass","drift","lights"], adj:["coloured","broken","glass"],
 loc:"bulbfield", fixed:true, scenery:true,
 examine:"Thousands of them: red, green, amber, and the milky white that always went first, "+
   "tumbled by the sea until the sharp edges are gone and what is left is the colour. The "+
   "brass caps have all corroded off and lie separately in a rust-coloured seam further up "+
   "the beach, sorted by weight, because the sea sorts everything by weight in the end." },

greendoor:{ name:"green door", short:"green door", words:["door","greendoor"], adj:["green","painted","locked"],
 loc:"colonnade", fixed:true, scenery:true, locked:true, keyid:"keys",
 examine:function(){ return F.doorOpen
   ? "The green door stands open on a plank room full of tools."
   : "A door of vertical boards painted the dark municipal green that everything under a "+
     "pier was painted, with a big iron rim lock on it and a keyhole you could post a "+
     "letter through. It is locked. It has been locked since the ninth of December."; } },

prizewallobj:{ name:"prize wall", short:"prize wall", words:["wall","prizewall"], adj:["prize","north"],
 loc:"arcade", fixed:true, scenery:true,
 examine:function(){ return F.wallOpen
   ? "The prize wall stands open on its hinges, and there is a gap behind it going north."
   : "The whole north wall, boarded and papered and hung with the good prizes: bears, a "+
     "radio, a canteen of cutlery nobody has ever come close to winning. Along the bottom "+
     "of it, where the paper meets the floor, there is a line. Papered walls do not "+
     "generally have a line along the bottom."; } },

note:{ name:"scrap of card", short:"card", words:["card","note","scrap","paper"], adj:["scrap","damp"],
 loc:"bulbfield", size:1,
 initial:"A scrap of card is caught upright in the drift, the way a shell stands in shingle.",
 desc:"A scrap of card.",
 examine:"A rectangle of card, thick, damp, printed on one side.",
 read:"One side is a printed admission: SARNWICK PIER — TO THE BALLROOM — 6d. The other "+
   "side has been written on in pencil, small, by somebody who had time:\n\n"+
   "    \"The birds here were always the clever ones.\n"+
   "     Take one with you and it will do the arguing.\"" }

};

/* ============================================================
   STATE
   ============================================================ */
var F = {};                    /* story flags */
var S = {};                    /* the rest of it */
var WORN = {};
var OUT = function(){}, STATUS = function(){};
var pendingDisambig = null;    /* {verb, cands, raw} */
var lastNoun = null;
var lastCommand = null;

var CARRY_LIMIT = 14;           /* in size units, not items */
var FLARE_FULL  = 260;
var TIDE_PERIOD = 14;          /* turns per state of tide */

function resetState(){
 F = {
  wallOpen:false, ledgerRead:false, magicKnown:false,
  flareLit:false, chestOpen:false, tinOpen:false, bottleOpen:false,
  doorOpen:false, boatmanAwake:false, gullsGone:false, waspsGone:false,
  matLifted:false, boatBuilt:false, moored:"shingle", sailed:false,
  paced:false, dug:false, chartRead:false, plansRead:false,
  darkWarned:false, deaths:0, won:false, quit:false,
  hintIdx:0, firstFair:false
 };
 S = { room:"arcade", turns:0, tideT:0, tide:"out", flare:FLARE_FULL,
       visited:{}, dead:false, pendingRestart:false };
 WORN = {};
 for(var k in OBJ){ if(OBJ.hasOwnProperty(k)) OBJ[k].loc = OBJ[k].home; }
 lastNoun=null; lastCommand=null; pendingDisambig=null;
}
/* remember the authored starting positions once */
(function(){ for(var k in OBJ) if(OBJ.hasOwnProperty(k)) OBJ[k].home = OBJ[k].loc; })();

function room(){ return ROOMS[S.room]; }
function o(id){ return OBJ[id]; }
function txt(v){ return (typeof v === "function") ? v() : v; }

function say(s,style){ OUT(s+"\n",style); }
function sayp(s){ OUT("\n"+s+"\n"); }

/* ============================================================
   SCOPE
   ============================================================ */
function carried(id){ return OBJ[id].loc==="PLAYER"; }
function worn(id){ return !!WORN[id]; }

function here(id){
 var x = OBJ[id];
 if(x.loc==="PLAYER") return true;
 if(x.loc===S.room) return true;
 if(x.loc && x.loc.indexOf("IN:")===0){
  var host = x.loc.slice(3);
  if(!OBJ[host].open) return false;
  return here(host);
 }
 return false;
}

function visible(id){
 var x = OBJ[id];
 if(x.loc==="GONE") return false;
 if(x.hidden) return false;
 if(!here(id)) return false;
 if(isDark() && x.loc!=="PLAYER") return false;
 return true;
}

function contents(hostLoc){
 var r=[];
 for(var k in OBJ) if(OBJ.hasOwnProperty(k) && OBJ[k].loc===hostLoc) r.push(k);
 return r;
}

function inventory(){ return contents("PLAYER"); }

function bulk(){
 var n=0, inv=inventory();
 for(var i=0;i<inv.length;i++) if(!worn(inv[i])) n += (OBJ[inv[i]].size||1);
 return n;
}

/* ---- light ---- */
function hasLight(){
 if(!F.flareLit) return false;
 return OBJ.flare.loc==="PLAYER" || OBJ.flare.loc===S.room;
}
function isDark(){ return !!room().dark && !hasLight(); }

/* ============================================================
   NAMING
   ============================================================ */
function theName(id){
 var x=OBJ[id];
 var n=x.short||x.name;
 if(x.proper) return n;
 return "the "+n;
}
function aName(id){
 var x=OBJ[id];
 var n=x.name;
 if(x.proper) return n;
 if("aeiou".indexOf(n.charAt(0).toLowerCase())>=0) return "an "+n;
 return "a "+n;
}
function shortName(id){ return OBJ[id].short||OBJ[id].name; }

/* ============================================================
   VOCABULARY
   ============================================================ */
var DIRS = {
 north:"north", n:"north", s:"south", south:"south", e:"east", east:"east",
 w:"west", west:"west", u:"up", up:"up", d:"down", down:"down",
 ne:"north", nw:"north", se:"south", sw:"south",
 upstairs:"up", downstairs:"down", in:"in", out:"out", inside:"in", outside:"out"
};

var PREPS = {
 in:"in", into:"in", inside:"in", within:"in",
 on:"on", onto:"on", upon:"on",
 under:"under", underneath:"under", beneath:"under", below:"under", behind:"under",
 with:"with", using:"with",
 to:"to", at:"to", toward:"to", towards:"to",
 from:"from", off:"from", "out-of":"from",
 about:"about", for:"for", over:"on", through:"in"
};

/* NOTE: never put a direction word (up/down/in/out) or a pronoun (it/that/those)
   in here — stripNoise runs before direction and pronoun resolution, and eating
   "up" turns UP into "Which way?". That bug shipped once. */
var NOISE = ["the","a","an","some","my","please","of","just","now"];

/* one-word verb synonyms → canonical */
var VERBS = {
 look:"look", l:"look", "look-around":"look", stare:"look",
 examine:"examine", x:"examine", inspect:"examine", study:"examine", watch:"examine",
 check:"examine", describe:"examine",
 search:"search", frisk:"search",
 read:"read", peruse:"read",
 take:"take", get:"take", grab:"take", carry:"take", steal:"take", pocket:"take",
 hold:"take", collect:"take",
 drop:"drop", release:"drop", discard:"drop", leave:"drop",
 put:"put", place:"put", insert:"put", stow:"put", store:"put", return:"put",
 give:"give", offer:"give", feed:"give", hand:"give", pay:"give", bribe:"give",
 throw:"throw", chuck:"throw", toss:"throw",
 open:"open", unwrap:"open",
 close:"close", shut:"close",
 lock:"lock", unlock:"unlock",
 light:"light", ignite:"light", kindle:"light", burn:"light", strike:"light",
 unlight:"unlight", extinguish:"unlight", douse:"unlight", quench:"unlight",
 wear:"wear", don:"wear",
 remove:"remove", doff:"remove",
 push:"push", shove:"push", press:"push", move:"push", shift:"push", slide:"push",
 pull:"pull", tug:"pull", drag:"pull", lift:"pull", raise:"pull",
 dig:"dig", excavate:"dig", burrow:"dig",
 fill:"fill", empty:"empty", pour:"empty",
 wake:"wake", awaken:"wake", rouse:"wake", awake:"wake",
 build:"build", make:"build", assemble:"build", construct:"build", repair:"build",
 fix:"build", rebuild:"build",
 board:"board", embark:"board", enter:"go",
 disembark:"disembark", exit:"go",
 sail:"setsail", steer:"setsail", launch:"setsail", row:"setsail",
 weigh:"weigh", anchor:"weigh",
 say:"say", shout:"say", yell:"say", speak:"say", utter:"say", chant:"say",
 pray:"say", ask:"ask", tell:"ask", talk:"ask",
 go:"go", walk:"go", run:"go", head:"go", travel:"go", proceed:"go", climb:"climb",
 swim:"swim", dive:"swim", wade:"swim",
 jump:"jump", leap:"jump",
 pace:"pace", count:"pace", step:"pace",
 wait:"wait", z:"wait", sleep:"wait", rest:"wait",
 listen:"listen", hear:"listen",
 smell:"smell", sniff:"smell",
 touch:"touch", feel:"touch", rub:"touch", knock:"touch",
 eat:"eat", drink:"eat", taste:"eat", bite:"eat",
 kiss:"kiss", hug:"kiss",
 attack:"attack", kill:"attack", hit:"attack", break:"attack", smash:"attack",
 fight:"attack", cut:"attack",
 inventory:"inventory", i:"inventory", inv:"inventory",
 score:"score", rank:"score", prizes:"score",
 diagnose:"diagnose", health:"diagnose",
 help:"help", verbs:"help", commands:"help", "?":"help",
 about:"about", credits:"about", info:"about",
 hint:"hint", hints:"hint", clue:"hint",
 save:"save", restore:"restore", load:"restore",
 quit:"quit", q:"quit", restart:"restart",
 verbose:"verbose", brief:"brief", superbrief:"superbrief",
 again:"again", g:"again",
 yes:"yes", y:"yes", no:"no", n_:"no",
 xyzzy:"xyzzy", plugh:"xyzzy", hoopla:"magic",
 undo:"undo", version:"about", swear:"swear",
 pick:"pick", set:"set", cast:"setsail", blow:"blow", turn:"turn", switch:"turn",
 sit:"sit", stand:"stand", climbup:"up"
};

/* multi-word verbs, longest first */
var PHRASAL = [
 ["look under","lookunder"], ["look underneath","lookunder"], ["look beneath","lookunder"],
 ["look behind","lookunder"], ["peek under","lookunder"], ["lift up","pull"],
 ["look in","lookin"], ["look inside","lookin"], ["look into","lookin"],
 ["look through","lookin"], ["look at","examine"], ["look for","search"],
 ["pick up","take"], ["pick-up","take"], ["take off","remove"], ["put on","wear"],
 ["put out","unlight"], ["blow out","unlight"], ["turn off","unlight"],
 ["turn on","light"], ["switch on","light"], ["switch off","unlight"],
 ["set fire to","light"], ["set light to","light"],
 ["set sail","setsail"], ["cast off","setsail"], ["weigh anchor","weigh"],
 ["get on","board"], ["get in","board"], ["get aboard","board"], ["climb on","board"],
 ["get off","disembark"], ["get out","disembark"], ["climb out","disembark"],
 ["get up","stand"], ["stand up","stand"],
 ["go to","go"], ["walk to","go"], ["head to","go"], ["go through","go"],
 ["wake up","wake"], ["put down","drop"], ["set down","drop"],
 ["search for","search"], ["dig in","dig"], ["dig up","dig"],
 ["turn over","pull"], ["roll up","pull"], ["take inventory","inventory"],
 ["count paces","pace"], ["walk paces","pace"], ["pace out","pace"],
 ["say score","score"], ["shout score","score"]
];

/* build the noun index */
var NOUNIDX = {};
(function(){
 for(var k in OBJ){
  if(!OBJ.hasOwnProperty(k)) continue;
  var ws = OBJ[k].words || [];
  for(var i=0;i<ws.length;i++){
   var w = ws[i];
   if(!NOUNIDX[w]) NOUNIDX[w]=[];
   NOUNIDX[w].push(k);
  }
 }
})();

function isAdjOf(id,w){
 var a = OBJ[id].adj||[];
 return a.indexOf(w)>=0;
}

/* ============================================================
   PARSER
   ============================================================ */
function normalise(line){
 return String(line).toLowerCase()
  .replace(/[^a-z0-9'\-\s\.,;!\?]/g," ")
  .replace(/\s+/g," ").trim();
}

function splitCommands(line){
 /* full stops, semicolons and "then" separate whole commands */
 var parts = line.split(/\s*[\.;!\?]+\s*|\s+then\s+|\s+and\s+then\s+/);
 var out=[];
 for(var i=0;i<parts.length;i++){
  var p=parts[i].trim();
  if(p) out.push(p);
 }
 /* "and" is doing two jobs. In "take the hammer and the screws" it joins a list;
    in "take the ledger and read it" it joins two commands. Tell them apart by
    what follows: if it is a verb, it is a new command. */
 var split=[];
 for(var j=0;j<out.length;j++){
  var w=out[j].split(" "), cur=[], k;
  for(k=0;k<w.length;k++){
   if(w[k]==="and" && k+1<w.length && startsCommand(w.slice(k+1))){
    if(cur.length) split.push(cur.join(" "));
    cur=[];
    continue;
   }
   cur.push(w[k]);
  }
  if(cur.length) split.push(cur.join(" "));
 }
 return split.length?split:[""];
}

/* would this token run be read as a command rather than a noun phrase? */
function startsCommand(rest){
 var w=rest[0];
 if(!w) return false;
 if(DIRS[w] && rest.length===1) return true;
 if(!VERBS[w]) {
  for(var i=0;i<PHRASAL.length;i++){
   var head=PHRASAL[i][0].split(" ")[0];
   if(head===w) return true;
  }
  return false;
 }
 /* a word that is both a verb and a noun ("anchor", "light", "screw") only
    starts a command when nothing noun-shaped follows it as an article */
 return true;
}

function tokenise(cmd){
 var raw = cmd.replace(/,/g," , ").split(" ");
 var t=[];
 for(var i=0;i<raw.length;i++){
  var w = raw[i].trim();
  if(!w) continue;
  /* galloper's -> galloper, gulls' -> gulls */
  w = w.replace(/'s$/,"").replace(/'$/,"");
  if(!w) continue;
  t.push(w);
 }
 return t;
}

function stripNoise(tok){
 var out=[];
 for(var i=0;i<tok.length;i++){
  if(NOISE.indexOf(tok[i])>=0) continue;
  out.push(tok[i]);
 }
 return out;
}

/* find the verb at the head of the token list; returns {verb, rest} */
function findVerb(tok){
 /* phrasal first — try 3-word, then 2-word */
 for(var n=3;n>=2;n--){
  if(tok.length>=n){
   var phrase = tok.slice(0,n).join(" ");
   for(var i=0;i<PHRASAL.length;i++){
    if(PHRASAL[i][0]===phrase) return {verb:PHRASAL[i][1], rest:tok.slice(n)};
   }
  }
 }
 var w = tok[0];
 /* a bare direction is a movement command */
 if(DIRS[w] && tok.length===1) return {verb:"go", rest:[w]};
 if(VERBS[w]) return {verb:VERBS[w], rest:tok.slice(1)};
 return null;
}

/* split the remainder around a preposition */
function splitPrep(rest){
 for(var i=0;i<rest.length;i++){
  var p = PREPS[rest[i]];
  if(p){
   /* "look at" style already handled; don't split on a leading prep */
   return { first:rest.slice(0,i), prep:p, second:rest.slice(i+1) };
  }
 }
 return { first:rest, prep:null, second:[] };
}

/* split a noun phrase on "and" / commas into several phrases */
function splitList(words){
 var groups=[[]], gi=0;
 for(var i=0;i<words.length;i++){
  if(words[i]==="and"||words[i]===","){ if(groups[gi].length){ groups.push([]); gi++; } continue; }
  groups[gi].push(words[i]);
 }
 return groups.filter(function(g){ return g.length; });
}

/* ---- resolve a noun phrase to an object id ---- */
/* returns {id} | {err:"..."} | {many:[ids]} | {all:true} | {dir:"north"} */
function resolve(words, opt){
 opt = opt||{};
 words = stripNoise(words);
 if(!words.length) return {err:"MISSING"};

 var joined = words.join(" ");
 if(joined==="all"||joined==="everything"||joined==="every thing") return {all:true};
 if(joined==="me"||joined==="myself"||joined==="self") return {err:"SELF"};
 if(words.length===1 && DIRS[words[0]]) return {dir:DIRS[words[0]]};

 if(joined==="it"||joined==="them"||joined==="those"||joined==="that"){
  if(lastNoun && OBJ[lastNoun]) return {id:lastNoun};
  return {err:"NOREF"};
 }

 /* candidates: any object one of whose nouns appears in the phrase */
 var cands = {}, sawNoun=false;
 for(var i=0;i<words.length;i++){
  var hit = NOUNIDX[words[i]];
  if(hit){ sawNoun=true; for(var j=0;j<hit.length;j++) cands[hit[j]]=true; }
 }
 if(!sawNoun){
  /* is any word simply unknown? */
  for(var k=0;k<words.length;k++){
   if(!NOUNIDX[words[k]] && !VERBS[words[k]] && !PREPS[words[k]] && !DIRS[words[k]] &&
      !isKnownAdj(words[k]) && words[k]!==","){
    return {err:"VOCAB", word:words[k]};
   }
  }
  return {err:"NOTHING"};
 }

 var ids = Object.keys(cands);

 /* Only things you can actually see are candidates. Then score by HOW MUCH of
    what was typed each one matches: a noun hit is worth more than an adjective
    hit, and "tin box" must beat "box" or the japanned tin box is forever
    ambiguous with the matchbox and the sea-chest. */
 var inScope = ids.filter(visible);
 if(!inScope.length){
  if(ids.length) return {err:"NOTHERE", id:ids[0]};
  return {err:"NOTHING"};
 }
 var best=-1, winners=[];
 for(var n=0;n<inScope.length;n++){
  var id=inScope[n], sc=0, ws=OBJ[id].words||[];
  for(var m=0;m<words.length;m++){
   var w=words[m];
   if(ws.indexOf(w)>=0) sc+=2;
   else if(isAdjOf(id,w)) sc+=1;
  }
  if(sc>best){ best=sc; winners=[id]; }
  else if(sc===best) winners.push(id);
 }
 if(winners.length===1) return {id:winners[0]};
 if(opt.preferHeld){
  var held = winners.filter(carried);
  if(held.length===1) return {id:held[0]};
 }
 return {many:winners};
}

var ADJSET = null;
function isKnownAdj(w){
 if(!ADJSET){
  ADJSET={};
  for(var k in OBJ){ if(!OBJ.hasOwnProperty(k)) continue;
   (OBJ[k].adj||[]).forEach(function(a){ ADJSET[a]=true; }); }
 }
 return !!ADJSET[w];
}

function nameList(ids){
 return listWords(ids.map(function(id){ return theName(id); }));
}

/* ============================================================
   DESCRIBING
   ============================================================ */
var MODE = "verbose";   /* verbose | brief | superbrief */

function exitList(){
 var e = room().exits||{}, out=[];
 for(var d in e){
  if(!e.hasOwnProperty(d)) continue;
  var v=e[d];
  if(typeof v==="string"){ out.push(d); continue; }
  if(v.to) out.push(d);
 }
 return out;
}

function roomBody(){
 var r=room();
 if(r.dark && !hasLight()) return r.long;
 if(r.lit && hasLight()) return r.lit;
 return r.long;
}

function describeRoom(force){
 var r=room();
 if(isDark()){
  say("");
  say("It is pitch dark. You can see the shape of the opening you came through and "+
      "nothing else at all.");
  listHere();
  return;
 }
 var first = !S.visited[S.room];
 S.visited[S.room]=true;
 OUT("\n");
 OUT(cap(r.name)+"\n","head");
 if(MODE==="verbose" || (MODE==="brief" && first) || force){
  say(roomBody());
 }
 listHere();
}

function listHere(){
 if(isDark()) return;
 var ids=[];
 for(var k in OBJ){
  if(!OBJ.hasOwnProperty(k)) continue;
  var x=OBJ[k];
  if(x.loc!==S.room) continue;
  if(x.scenery) continue;
  if(x.hidden) continue;
  ids.push(k);
 }
 if(!ids.length) return;
 say("");
 for(var i=0;i<ids.length;i++){
  var x=OBJ[ids[i]];
  var line = (!x.moved && x.initial) ? txt(x.initial) : txt(x.desc||("There is "+aName(ids[i])+" here."));
  say(line);
  /* open containers show their contents */
  if(x.container && x.open){
   var inner = contents("IN:"+ids[i]);
   if(inner.length) say("   It contains "+listWords(inner.map(aName))+".");
  }
 }
}

/* ============================================================
   MOVEMENT
   ============================================================ */
function resolveDest(v){
 if(typeof v==="string") return v;
 if(v.to==="@shore") return F.moored;
 return v.to;
}

function go(dir){
 var r=room();

 if(S.room==="deck" && (dir==="down"||dir==="west"||dir==="out"||dir==="east")){
  enterRoom(F.moored);
  return true;
 }

 var e=r.exits[dir];

 if(isDark() && dir){
  return blunder(dir);
 }

 if(!e){
  say(oneOf([
   "You can't go that way.",
   "There is nothing that way but the wall, and you have met the wall.",
   "Not that way."
  ]));
  return true;
 }
 if(typeof e==="object"){
  if(!e.to){ say(e.fail); return true; }
  if(e.flag && !F[e.flag]){ say(e.fail); return true; }
  if(e.check){
   var res = exitCheck(e.check);
   if(res===false) return true;
  }
 }
 var dest = resolveDest(e);
 if(!dest){ say("You can't go that way."); return true; }
 enterRoom(dest);
 return true;
}

function exitCheck(kind){
 if(kind==="landing"){
  if(!worn("plimsolls")){
   if(carried("plimsolls")){
    say("You get one foot onto the fire escape, and the wet iron takes it away from you "+
        "instantly and completely. You catch the sash on the way down and hang there with "+
        "your heart going like a bird until you can get your knee back over the sill.");
    say("");
    say("You are carrying a pair of rubber plimsolls. Carrying them is not the point of them.");
   } else {
    say("You put a foot out onto the grating and the wet iron slides it straight out from "+
        "under you. You get back in through the window with both hands and no dignity.");
    say("");
    say("Not in these shoes.");
   }
   return false;
  }
  return true;
 }
 if(kind==="sea"){
  if(!worn("lifering")){
   say("You walk out into the sea.");
   say("");
   say("The shingle shelves away under you much faster than shingle ought to, the cold "+
       "closes on your chest like a hand, and you discover that you cannot swim nearly as "+
       "well as a person who has not tried it for thirty years believes he can.");
   death("You drown, twelve feet from dry land, in eight feet of water.");
   return false;
  }
  return true;
 }
 if(kind==="gulls"){
  if(!F.gullsGone){
   say("You start down into the lagoon and the gulls come up off the water all at once, "+
       "twelve of them, screaming, close enough that you feel the wind of it on your face. "+
       "You back off. They settle again and go on standing there, watching you, entirely "+
       "unbothered.");
   say("");
   say("They want something. Gulls always want something.");
   return false;
  }
  return true;
 }
 return true;
}

function blunder(dir){
 if(!F.darkWarned){
  F.darkWarned=true;
  say("It is pitch dark in here, and moving about in the dark under a pier is how people "+
      "end up in the papers. You take one careful step and stop.");
  return true;
 }
 if(Math.random()<0.25){
  say("You move off into the dark with your hand out, and your hand finds nothing, and "+
      "then the floor finds nothing either.");
  death("You fall a considerable distance onto something structural.");
  return true;
 }
 var e=room().exits||{}, ds=[];
 for(var d in e) if(e.hasOwnProperty(d)) ds.push(d);
 var pick = ds.length? oneOf(ds) : dir;
 var dest = resolveDest(e[pick]);
 say("You blunder off in the dark, hit a wall with your shoulder, follow it, and come out "+
     "somewhere.");
 if(dest && ROOMS[dest]) enterRoom(dest);
 return true;
}

function enterRoom(dest){
 var prev=S.room;
 S.room=dest;

 /* the boatman follows once he is awake */
 if(F.boatmanAwake && OBJ.boatman.loc===prev && ROOMS[dest].world==="fair"){
  OBJ.boatman.loc=dest;
 }
 describeRoom();

 /* entry events */
 if(dest==="wintergardens" && !F.waspsGone){
  if(carried("starling")){
   F.waspsGone=true;
   OBJ.wasps.loc="GONE";
   say("");
   say("The starling comes off your shoulder before you have finished looking at the nest. "+
       "What follows is short and businesslike and mostly too fast to see. Starlings eat "+
       "wasps. Starlings have always eaten wasps. It works through them the way a man works "+
       "through a job he has done a thousand times, and in ninety seconds there is no nest "+
       "worth speaking of and no argument left in the air at all.");
   say("");
   say("It comes back to your shoulder, entirely unhurried, and says: \"Told you.\"");
  } else {
   say("");
   say("The air under the nest is busy, and it gets busier while you stand there. Whatever "+
       "is worth having in this glasshouse is directly underneath it.");
  }
 }
 if(dest==="sea" && worn("lifering")){
  say("");
  say("The cork holds you up like a hand under your chin. It is a horrible way to travel "+
      "and an extremely good way to not drown.");
 }
 if(dest==="lostproperty"){ /* handled by death() */ }
}

/* ============================================================
   DEATH
   ============================================================ */
function death(msg){
 say("");
 say(msg);
 F.deaths++;
 S.dead=true;
 S.room="lostproperty";
 OUT("\n");
 OUT("The Lost Property Office\n","head");
 say(ROOMS.lostproperty.long);
 say("");
 say("(Say YES, and he will find your things and let you out through the side door.)");
 S.pendingRestart=true;
}

function revive(){
 S.dead=false; S.pendingRestart=false;
 say("");
 say("He goes away along the shelves and comes back with everything you were carrying in a "+
     "wire basket, checks it off against nothing at all, has you sign a book, and opens a "+
     "door you had not noticed. You step through it into the smell of hot dust and old "+
     "copper.");
 F.darkWarned=false;
 enterRoom("arcade");
}

/* ============================================================
   SCORING
   ============================================================ */
var TREASURES = ["pennies","brassring","galloper","helmet","organpipe"];

function stored(){
 return TREASURES.filter(function(t){ return OBJ[t].loc==="IN:cabinet"; });
}
function scoreNow(){
 return stored().reduce(function(a,t){ return a+OBJ[t].points; },0);
}
function rankFor(p){
 if(p>=100) return "Alderman Vane's Undoing";
 if(p>=75)  return "Master of the Fair";
 if(p>=50)  return "Salvor";
 if(p>=25)  return "Penny Diver";
 if(p>0)    return "Beachcomber";
 return "Day-Tripper";
}

function doScore(){
 var st=stored(), p=scoreNow();
 say("");
 if(!st.length){
  say("There is nothing in the cabinet yet. Five ring-marks in the dust, and no rings.");
 } else {
  say("In the cabinet:");
  st.forEach(function(t){ say("    "+cap(shortName(t))+" — "+OBJ[t].points); });
 }
 say("");
 say("That is "+p+" out of a possible 100, which makes you: "+rankFor(p)+".");
 if(p>=100) win();
 else if(st.length) say("("+(5-st.length)+" still down there.)");
}

function win(){
 F.won=true;
 say("");
 OUT("* * *\n","head");
 say("");
 say("You put the last of it on the shelf and step back, and the five of them stand in "+
     "their five ring-marks in the dust as though they had been taken out to be cleaned "+
     "and put back the same afternoon.");
 say("");
 say("Nothing supernatural happens. The lights do not come on. There is no music. It is "+
     "still November and the shutter is still down and your uncle is still in Peterborough "+
     "General. What happens is this: the word stops working. You try it twice more over the "+
     "following week, in the booth and on the fire escape, feeling foolish both times, and "+
     "the arcade stays exactly where it is.");
 say("");
 say("A. Vane said the sea could have them.");
 say("");
 say("It could not.");
 say("");
 OUT("*** You have won the Drowned Fair ***\n","head");
 say("");
 say("Final score: 100 out of 100 — "+rankFor(100)+".");
 say("Deaths: "+F.deaths+". Turns: "+S.turns+".");
 S.pendingRestart=false;
}

/* ============================================================
   THE STARLING
   ============================================================ */
function starlingHint(){
 var h=[];
 if(!F.magicKnown) h.push("\"There's a book,\" the starling observes, \"in the little booth. People do read them.\"");
 if(F.magicKnown && !F.wallOpen) h.push("\"That prize wall isn't a wall,\" says the starling. \"Push it.\"");
 if(!F.matLifted) h.push("\"Under the mat,\" says the starling. \"It is always under the mat.\"");
 if(F.matLifted && !F.chestOpen) h.push("\"You've the keys,\" says the starling. \"Use them on the chest.\"");
 if(!F.boatmanAwake) h.push("\"He'll not wake for shouting,\" says the starling. \"He'll wake for a bottle.\"");
 if(!F.flareLit) h.push("\"It's black as a hat down those tunnels,\" says the starling. \"Bring the flare and a match.\"");
 if(!F.gullsGone) h.push("\"Gulls want chips,\" says the starling, with feeling. \"Everybody wants chips.\"");
 if(F.boatBuilt && !F.sailed) h.push("\"Wait for the water,\" says the starling. \"Then weigh the anchor and set the sail.\"");
 if(F.sailed && !F.paced) h.push("\"Forty paces from the standing horse,\" says the starling. \"And then you dig.\"");
 if(!F.boatBuilt && F.chestOpen) h.push("\"Six parts and the drawing,\" says the starling. \"Read the drawing.\"");
 if(!h.length) h.push("\"Get it in the cabinet,\" says the starling. \"It's no good to anybody in your pockets.\"");
 var pick = h[F.hintIdx % h.length];
 F.hintIdx++;
 return pick;
}

/* ============================================================
   DAEMONS — run once per successful turn
   ============================================================ */
function daemons(){
 S.turns++;

 /* tide */
 S.tideT++;
 if(S.tideT>=TIDE_PERIOD){
  S.tideT=0;
  S.tide = (S.tide==="out") ? "in" : "out";
  var r=S.room;
  if(r==="shingle"||r==="lagoon"||r==="deck"||r==="sandbar"){
   say("");
   say(S.tide==="in"
    ? "The tide has turned. Water is coming up the shingle in long flat runs, further each time."
    : "The tide has turned. The water is going out, and it goes out fast here, and it leaves "+
      "everything it was hiding.");
  }
 }
 updateTideObjects();

 /* the flare burns itself */
 if(F.flareLit){
  S.flare--;
  if(S.flare===60) say("\nThe flare is burning lower.");
  if(S.flare===25) say("\nThe flare is definitely burning lower. You can hear the fuel is nearly through.");
  if(S.flare<=0){
   F.flareLit=false; S.flare=0;
   say("");
   say("The flare gutters, flattens, goes blue, and goes out. The dark comes back in from "+
       "all sides at once, as though it had been waiting just outside the light the whole time.");
   if(room().dark) say("It is now pitch dark.");
  }
 }

 /* the starling */
 if(carried("starling") && S.turns%9===0){
  say("");
  say(starlingHint());
 }
}

function updateTideObjects(){
 var inNow = (S.tide==="in");
 /* the helmet sits below half tide; the bottle is well up the pool and always there */
 if(OBJ.helmet.loc==="lagoon") OBJ.helmet.hidden = inNow;
}

/* ============================================================
   ACTIONS
   ============================================================ */
function canReach(id){
 if(!visible(id)){ say("You can't see any such thing."); return false; }
 return true;
}

function doTake(id){
 var x=OBJ[id];
 if(x.loc==="PLAYER"){ say("You already have "+theName(id)+"."); return; }
 if(!visible(id)){ say("You can't see any such thing."); return; }
 if(x.fixed||x.scenery){
  say(x.animate ? cap(theName(id))+" would have a good deal to say about that."
                : cap(theName(id))+" is not going anywhere.");
  return;
 }
 if(id==="organpipe" && !F.waspsGone){ waspSting(); return; }
 if(id==="tinbox" && !F.waspsGone){ waspSting(); return; }
 if(bulk() + (x.size||1) > CARRY_LIMIT){
  say("Your arms are full. You are going to have to put something down, or make two trips, "+
      "which is what everyone ends up doing.");
  return;
 }
 x.loc="PLAYER"; x.moved=true; x.hidden=false;
 if(id==="starling"){
  say("The starling steps onto your finger, walks up your arm, and settles on your shoulder "+
      "with the air of someone taking a job.");
  return;
 }
 if(x.treasure){
  say("You take "+theName(id)+". It is heavier than it looks and it is worth more than it "+
      "weighs.");
  return;
 }
 say(oneOf(["Taken.","You take "+theName(id)+".","Got it.","You pick up "+theName(id)+"."]));
}

function doDrop(id){
 if(!carried(id)){ say("You aren't carrying "+theName(id)+"."); return; }
 if(worn(id)) WORN[id]=false;
 OBJ[id].loc=S.room; OBJ[id].moved=true;
 if(id==="starling"){ say("The starling hops off and finds something to stand on."); return; }
 say(oneOf(["Dropped.","You put "+theName(id)+" down.","You set "+theName(id)+" down."]));
}

function waspSting(){
 say("You reach in under the nest.");
 say("");
 say("The whole grey mass comes apart at once, and the air is solid, and there is no part "+
     "of you that they cannot reach.");
 death("You go down in the sand under the ironwork, and the wasps see to the rest.");
}

function doExamine(id){
 var x=OBJ[id];
 if(!visible(id)){ say("You can't see any such thing."); return; }
 var e=x.examine;
 if(e){ say(txt(e)); }
 else say("You see nothing special about "+theName(id)+".");
 if(x.container){
  if(!x.open) say("It is closed.");
  else {
   var inner=contents("IN:"+id);
   say(inner.length? "It contains "+listWords(inner.map(aName))+"." : "It is empty.");
  }
 }
 if(worn(id)) say("(You are wearing it.)");
}

function doRead(id){
 var x=OBJ[id];
 if(!visible(id)){ say("You can't see any such thing."); return; }
 if(!x.read){ doExamine(id); return; }
 say(txt(x.read));
 if(id==="ledger"){ F.ledgerRead=true; F.magicKnown=true; }
 if(id==="chart"){ F.chartRead=true; }
 if(id==="plans"){ F.plansRead=true; }
}

function doOpen(id){
 var x=OBJ[id];
 if(!visible(id)){ say("You can't see any such thing."); return; }
 if(!x.container){ say("That isn't something you can open."); return; }
 if(x.open){ say("It is already open."); return; }
 if(x.locked){
  say("It is locked.");
  return;
 }
 x.open=true;
 if(id==="chest") F.chestOpen=true;
 if(id==="tinbox"){
  if(!F.waspsGone){ x.open=false; waspSting(); return; }
  F.tinOpen=true;
  say("The catch gives with a small expensive click and the lid comes up on a hinge that "+
      "has not been used since the coronation.");
  say("");
  say("Inside, on a bed of tissue that has gone the colour of weak tea, is a brass ring, "+
      "and a slip of paper folded under it.");
  return;
 }
 if(id==="bottle"){
  F.bottleOpen=true;
  say("You break the wax off with your thumbnail and work the cork out. It comes with a "+
      "hollow sound that seems to go on rather longer than it should.");
  say("");
  say("There is a rolled chart inside.");
  return;
 }
 say("Opened.");
 var inner=contents("IN:"+id);
 if(inner.length) say("Inside is "+listWords(inner.map(aName))+".");
}

function doClose(id){
 var x=OBJ[id];
 if(!visible(id)){ say("You can't see any such thing."); return; }
 if(!x.container){ say("That isn't something you can close."); return; }
 if(!x.open){ say("It is already closed."); return; }
 x.open=false; say("Closed.");
}

function doUnlock(id,keyId){
 var x=OBJ[id];
 if(!visible(id)){ say("You can't see any such thing."); return; }
 if(id==="door"||id==="greendoor"){ /* handled below via scenery */ }
 if(!x.locked){ say("It isn't locked."); return; }
 if(!keyId){ say("Unlock it with what?"); return; }
 if(keyId!==x.keyid || !carried(keyId)){
  say("That doesn't fit.");
  return;
 }
 x.locked=false;
 say("The fourth key you try turns the lock, stiffly, all the way over.");
}

function doWear(id){
 if(!carried(id)){
  if(visible(id)){ doTake(id); if(!carried(id)) return; }
  else { say("You can't see any such thing."); return; }
 }
 if(!OBJ[id].wearable){ say("You can't wear that."); return; }
 if(worn(id)){ say("You are already wearing it."); return; }
 WORN[id]=true;
 if(id==="plimsolls") say("You change into the plimsolls. They fit, more or less, and the "+
   "soles grip the arcade carpet in a way your own shoes have never once done.");
 else if(id==="lifering") say("You get the life-ring over your head and under your arms. "+
   "You look like a man about to be photographed for a local paper. You are also, now, "+
   "extremely difficult to drown.");
 else say("You put on "+theName(id)+".");
}

function doRemove(id){
 if(!worn(id)){ say("You aren't wearing that."); return; }
 WORN[id]=false;
 say("You take off "+theName(id)+".");
}

function doLight(id){
 if(id && id!=="flare"){
  if(id==="matches"){ say("You strike a match. It burns down and you drop it. That was the "+
    "whole of that experience."); return; }
  say("You can't set fire to that, and you shouldn't want to.");
  return;
 }
 if(!here("flare")){ say("You haven't got anything to light."); return; }
 if(F.flareLit){ say("It's already burning."); return; }
 if(!carried("matches")){ say("You have nothing to light it with."); return; }
 if(S.flare<=0){ say("The flare is dry. There is nothing left in it to burn."); return; }
 F.flareLit=true;
 say("You open the valve, hold a match under the bell, and the naphtha catches with a soft "+
     "thump you feel in your chest. A flat yellow leaf of flame stands up a foot high and "+
     "roars gently to itself.");
 if(room().dark){ say(""); describeRoom(true); }
}

function doUnlight(id){
 if(!F.flareLit){ say("It isn't lit."); return; }
 if(!here("flare")){ say("You haven't got it."); return; }
 F.flareLit=false;
 say("You shut the valve. The flame shrinks, goes blue, and is gone, and the flare is just "+
     "a brass object again.");
 say("(Whatever is left in the reservoir stays in the reservoir. Which is the point of the "+
     "notice at the bottom of the stairs.)");
 if(room().dark){ say(""); say("It is now pitch dark."); }
}

function doPut(id,dest,prep){
 if(!carried(id)){
  if(visible(id)) { doTake(id); if(!carried(id)) return; }
  else { say("You aren't carrying that."); return; }
 }
 if(!dest){ doDrop(id); return; }
 if(!visible(dest)){ say("You can't see any such thing."); return; }
 var d=OBJ[dest];
 if(!d.container){ say("You can't put anything in "+theName(dest)+"."); return; }
 if(!d.open){ say(cap(theName(dest))+" is closed."); return; }
 if(dest==="cabinet") return storeTreasure(id);
 if(worn(id)) WORN[id]=false;
 OBJ[id].loc="IN:"+dest; OBJ[id].moved=true;
 say("You put "+theName(id)+" in "+theName(dest)+".");
}

function storeTreasure(id){
 if(!OBJ[id].treasure){
  if(worn(id)) WORN[id]=false;
  OBJ[id].loc="IN:cabinet"; OBJ[id].moved=true;
  say("You put "+theName(id)+" in the cabinet. It looks faintly ridiculous in there, "+
      "amongst the ring-marks.");
  return;
 }
 if(worn(id)) WORN[id]=false;
 OBJ[id].loc="IN:cabinet"; OBJ[id].moved=true;
 var n=stored().length;
 say("You set "+theName(id)+" on the glass shelf. It settles into one of the ring-marks in "+
     "the dust as though the dust had been keeping the place.");
 say("");
 say("That is "+n+" of five.");
 if(n===5) win();
}

function doGive(id,target){
 if(!target){ say("Give it to whom?"); return; }
 if(!visible(target)){ say("You can't see any such thing."); return; }
 if(!carried(id)){ say("You aren't carrying that."); return; }

 if(target==="gulls" && id==="chips"){
  F.gullsGone=true;
  OBJ.chips.loc="GONE";
  OBJ.gulls.loc="GONE";
  say("You unwrap the chips and throw them, in a wide arc, as far up the shingle as you can.");
  say("");
  say("What happens next is not really a description of birds. It is a description of "+
      "weather. The lagoon empties of gulls in under two seconds and the noise goes up the "+
      "beach with them and does not come back.");
  say("");
  say("The lagoon lies open to the south.");
  return;
 }
 if(target==="boatman" && id==="stout"){
  wakeBoatman();
  return;
 }
 if(target==="boatman"){
  say("He is asleep, and whatever he is waiting for, it isn't that.");
  return;
 }
 if(target==="gulls"){
  say("The gulls consider "+theName(id)+" and reject it, unanimously and at volume.");
  return;
 }
 if(target==="starling"){ say("The starling looks at it, then at you, then away."); return; }
 say("You can't give it to that.");
}

function wakeBoatman(){
 if(F.boatmanAwake){ say("He is already awake and already has your bottle."); return; }
 if(!carried("stout")){
  say("You shake him by the shoulder. It is like shaking a bollard. He does not stir, and "+
      "his hand stays curled around the shape of something that isn't in it.");
  return;
 }
 F.boatmanAwake=true;
 OBJ.boatman.moved=true;   /* stop listHere printing the "asleep on the bench" opener */
 OBJ.stout.loc="GONE";
 say("You put the bottle into his curled hand.");
 say("");
 say("His fingers close on it before any other part of him wakes up at all. Then he sits, "+
     "unhooks the stopper with his thumb, drinks about a third of it without appearing to "+
     "swallow, looks at the label, and says:");
 say("");
 say("    \"Sarnwick. Aye. They've not brewed that in a while.\"");
 say("");
 say("He gets up, puts his cap on, and looks at you the way a man looks at a job that has "+
     "turned up. \"Right then. You'll be wanting to go out to the bar. She'll want two "+
     "aboard her — you'd best build her first, and I'd best have a chart, and we'll neither "+
     "of us go anywhere on this tide.\"");
}

/* ---- building the Marigold ---- */
var BOAT_PARTS = ["hammer","screws","planking","anchor","awning","paddlewheel"];

function doBuild(){
 if(F.boatBuilt){ say("She is built. She is floating. Leave her alone."); return; }
 if(S.room!=="shingle"){
  say("There is nowhere here to build a boat, and no water to put one in.");
  return;
 }
 var havePlans = carried("plans") || OBJ.plans.loc==="shingle";
 if(!havePlans){
  say("You have a rough idea of what a boat looks like, which is exactly as much use as it "+
      "sounds. You would need the drawings.");
  return;
 }
 var missing = BOAT_PARTS.filter(function(p){
  return !(carried(p) || OBJ[p].loc==="shingle");
 });
 if(missing.length){
  say("You spread the plans out on the shingle and weight the corners with stones. Every "+
      "part is called out on the sheet in a draughtsman's capitals, and going down the list "+
      "and looking about you, you have not got:");
  say("");
  say("    "+missing.map(function(m){ return shortName(m).toUpperCase(); }).join(". ")+".");
  return;
 }
 F.boatBuilt=true;
 BOAT_PARTS.forEach(function(p){ OBJ[p].loc="GONE"; });
 OBJ.plans.loc="GONE";
 OBJ.marigold.loc="shingle";
 F.moored="shingle";
 say("You build the boat.");
 say("");
 say("It takes the rest of the afternoon and it is not difficult, which is the strange part. "+
     "The planking is numbered. The screw holes are already there. Every piece has been cut "+
     "by somebody who expected this to be done by somebody else, and the whole of the work "+
     "is doing what you are told in the order you are told it. She goes together like a "+
     "thing being remembered rather than a thing being made.");
 say("");
 if(F.boatmanAwake){
  say("The boatman does the last of the paddle box himself, without comment, and then stands "+
      "back and looks at her for a while and says nothing at all about it.");
  say("");
 }
 say("The Marigold sits on the shingle at the water's edge, thirty feet of her, awning up.");
}

function doBoard(){
 if(!F.boatBuilt){ say("There is nothing here to get aboard."); return; }
 if(S.room!==F.moored){ say("She isn't here. She is at "+(F.moored==="shingle"?"the shingle":"the sandbar")+"."); return; }
 enterRoom("deck");
 return;
}

function doWeigh(){
 if(S.room!=="deck"){ say("There is no anchor here to weigh."); return; }
 if(!F.boatmanAwake){
  say("You could get the anchor up on your own. Then you would be standing on a boat, "+
      "alone, in a channel you have never seen a chart of, and that would be the end of the "+
      "story and quite a short end.");
  return;
 }
 var haveChart = carried("chart") || OBJ.chart.loc==="deck";
 if(!haveChart){
  say("The boatman puts his hand flat on the wheel and shakes his head. \"Not without a "+
      "chart. There's a bar out there and there's one way over it and it isn't the way it "+
      "looks.\"");
  return;
 }
 if(S.tide!=="in"){
  say("\"On this water?\" says the boatman. \"We'd be sat on the bottom before we cleared "+
      "the legs. We go when it makes, and not before.\"");
  return;
 }
 F.weighed=true;
 say("You get the anchor up, hand over hand, and it comes streaming and clattering over the "+
     "gunwale with a great deal of weed on it. The boatman takes it off you, holds it out at "+
     "arm's length for a moment, and says:");
 say("");
 say("    \"About forty pound, that. Now try setting the sail.\"");
}

function doSetSail(){
 if(S.room!=="deck"){ say("You are not on a boat."); return; }
 if(!F.boatmanAwake){ say("You have no crew, and one man cannot do this."); return; }
 if(!F.weighed){ say("The anchor is still down. It rather settles the question."); return; }
 if(S.tide!=="in"){ say("The tide has gone out from under you. Wait for it."); return; }
 F.weighed=false;
 F.sailed=true;
 var to = (F.moored==="shingle") ? "sandbar" : "shingle";
 F.moored = to;
 say("The awning comes down, the sail goes up, and the boatman takes her out from under the "+
     "pier on a long slow slant with his eye on something you cannot see.");
 say("");
 if(to==="sandbar"){
  say("The crossing takes an hour. Twice he puts the helm over for no reason you can "+
      "detect and both times something dark slides past under the boat close enough to "+
      "touch. Then the water goes from green to brown to nothing at all, and the keel "+
      "grates, and you are there.");
  say("");
  say("\"I'll wait,\" he says, and sits down. \"I've waited longer.\"");
 } else {
  say("The pier comes up out of the haze bigger than it has any right to be, and she runs "+
      "up onto the shingle exactly where she was built.");
 }
 say("");
 enterRoom(to);
}

/* ---- digging and pacing ---- */
function doPace(n){
 if(S.room!=="carouselfield"){
  say("You walk about a bit. It doesn't help.");
  return;
 }
 if(!n){ say("How many paces?"); return; }
 if(n!==40){
  say("You pace out "+n+" paces from the standing horse, turn round, and look at the "+
      "identical sand under your feet, and the identical sand for a mile in every "+
      "direction, and the horse standing behind you with its one glass eye.");
  say("");
  say("You have a feeling the number matters.");
  F.paced=false;
  return;
 }
 F.paced=true;
 say("You put your back to the standing horse, take the direction it is facing, and walk it "+
     "out: forty paces, counting aloud, because there is nobody within a mile to hear you "+
     "do it.");
 say("");
 say("Forty. You stop. The sand here is exactly like the sand everywhere else, except that "+
     "when you put your heel down it sounds hollow.");
}

function doDig(){
 if(!carried("spade")){
  say("You scrape at it with your hands and get about four inches down before the sides "+
      "come in. This wants a spade.");
  return;
 }
 if(S.room==="carouselfield"){
  if(!F.paced){
   say("You dig a hole in a mile of identical sand. You get three feet down, find sand, "+
       "and stand in the hole feeling like exactly the sort of man who digs holes in sand.");
   say("");
   say("The chart said something about paces.");
   return;
  }
  if(F.dug){ say("You have already had this hole."); return; }
  F.dug=true;
  OBJ.pennies.loc="carouselfield"; OBJ.pennies.moved=false;
  say("Two feet down the spade rings on something that is not sand.");
  say("");
  say("You go down on your knees and get the rest of it out by hand: a stoneware jar, "+
      "sealed with wax, buried in a hurry by somebody who meant to come back for it within "+
      "the week and did not.");
  return;
 }
 if(S.room==="lagoon"||S.room==="sandbar"||S.room==="shingle"||S.room==="bulbfield"){
  say("You dig a respectable hole. The sea fills it in from underneath, slowly and without "+
      "any fuss, the way it does everything.");
  return;
 }
 say("There is nothing here worth digging, and nothing here you could dig.");
}

/* ---- the magic word ---- */
function doMagic(){
 if(!F.magicKnown){
  say("You say the word aloud. Your own voice comes back off the shutter, and nothing "+
      "whatever happens, because you have no idea what you are saying or why.");
  return;
 }
 var r=room();
 if(r.world==="town"){
  say("You say it aloud — HOOPLA — and feel immediately foolish, and then do not.");
  say("");
  say("The light goes wrong. Not dark: sideways. The stripes from the shutter slide off the "+
      "wall and keep going, and the smell of hot dust is replaced by the smell of weed and "+
      "cold iron, and there is suddenly a very great deal of noise underneath everything, "+
      "which is the sea.");
  if(!F.firstFair){
   F.firstFair=true;
   say("");
   say("It is 1911, and it is a Tuesday, and the pier is standing.");
  }
  enterRoom("shingle");
  return;
 }
 if(r.world==="fair"){
  say("You say it again — HOOPLA — and the whole of it goes out like a bulb.");
  enterRoom("arcade");
  return;
 }
 say("Nothing happens.");
}

/* ---- looking under ---- */
function doLookUnder(id){
 if(!visible(id)){ say("You can't see any such thing."); return; }
 if(id==="mat"){
  if(F.matLifted){ say("You have already had that up. There is nothing else under it."); return; }
  F.matLifted=true;
  OBJ.keys.loc=S.room; OBJ.keys.moved=false; OBJ.keys.hidden=false;
  say("You tip the roll over and unroll it about a foot, and something goes across the "+
      "boards with the particular flat clatter of iron on wood.");
  say("");
  say("A ring of keys.");
  return;
 }
 if(OBJ[id].under){ say(txt(OBJ[id].under)); return; }
 if(id==="boltedmat"){ say(txt(OBJ.boltedmat.under)); return; }
 say("There is nothing under "+theName(id)+".");
}

/* ---- misc verbs ---- */
function doSearch(id){
 if(!visible(id)){ say("You can't see any such thing."); return; }
 var x=OBJ[id];
 if(x.container){ if(!x.open) return doOpen(id); return doExamine(id); }
 if(id==="mat"||id==="boltedmat") return doLookUnder(id);
 doExamine(id);
}

function doPush(id){
 if(!visible(id)){ say("You can't see any such thing."); return; }
 if(id==="machines"){
  say("You put your shoulder to the end cabinet and it moves about an inch, revealing "+
      "forty years of dropped coins, all of them foreign.");
  return;
 }
 if(id==="cabinet"){ say("It is full of glass and it is staying where it is."); return; }
 if(id==="organ"){ say("The whole front of it moves and settles. You take your hands off it."); return; }
 if(id==="standinghorse"){
  say("You push the horse. It does not move, and it does not fall over, and after a moment "+
      "you stop pushing the horse.");
  return;
 }
 say("Pushing "+theName(id)+" achieves nothing in particular.");
}

function pushWall(){
 if(F.wallOpen){ say("It is already open."); return; }
 F.wallOpen=true;
 say("You lean on the prize wall out of pure November boredom, and the whole panel gives "+
     "an inch and then swings, quite smoothly, on hinges that somebody fitted on purpose.");
 say("");
 say("There is a gap behind it. There has been a gap behind it the entire time you have "+
     "been coming here, which is your whole life.");
}

function doAttack(id){
 if(id && OBJ[id] && OBJ[id].animate){
  if(id==="gulls"){ say("You run at the gulls. They rise about three feet, wait for you to "+
    "finish, and come down again in exactly the same places."); return; }
  if(id==="wasps"){ waspSting(); return; }
  if(id==="boatman"){ say("He is seventy and built like a bollard and you are a man who "+
    "minds an arcade. Let us not."); return; }
  if(id==="starling"){ say("Absolutely not."); return; }
 }
 say("Violence isn't the answer to this one.");
}

function doEat(id){
 var x=OBJ[id];
 if(!visible(id)){ say("You can't see any such thing."); return; }
 if(x.edible){ say(txt(x.edible)); return; }
 say("That is not edible, and you know it.");
}

/* ============================================================
   THE DISPATCHER
   ============================================================ */
/* A word that is in the room's own description but not in the vocabulary should
   not be answered with a vocabulary error — the game put it there. */
function sceneryWord(w){
 if(w.length<4) return false;
 var r=room();
 var hay=((r.long||"")+" "+(r.lit||"")+" "+(r.flavor||"")).toLowerCase();
 var ws=hay.split(/[^a-z0-9]+/);
 if(ws.indexOf(w)>=0 || ws.indexOf(w+"s")>=0) return true;
 return w.slice(-1)==="s" && ws.indexOf(w.slice(0,-1))>=0;
}

function need(words, verbName, opt){
 var r = resolve(words, opt);
 if(r.id) { lastNoun=r.id; return r.id; }
 if(r.all) return "@ALL";
 if(r.dir) return "@DIR:"+r.dir;
 if(r.many){
  pendingDisambig = {verb:verbName, cands:r.many};
  say("Which do you mean, "+r.many.map(function(i){ return theName(i); }).join(" or ")+"?");
  return null;
 }
 switch(r.err){
  case "MISSING": say("What do you want to "+verbName+"?"); break;
  case "VOCAB":
   if(sceneryWord(r.word))
    say("That is part of the scenery. There is nothing to it beyond the description, "+
        "and nothing under it either.");
   else
    say("The word \""+r.word+"\" isn't one this game knows.");
   break;
  case "NOREF":   say("It isn't clear what you are referring to."); break;
  case "SELF":    say("You are as well as can be expected."); break;
  case "NOTHERE": say("You can't see any such thing here."); break;
  default:        say("You can't see any such thing.");
 }
 return null;
}

function everythingHere(){
 var ids=[];
 for(var k in OBJ){
  if(!OBJ.hasOwnProperty(k)) continue;
  var x=OBJ[k];
  if(x.loc!==S.room) continue;
  if(x.scenery||x.fixed||x.hidden) continue;
  ids.push(k);
 }
 return ids;
}

function perform(verb, w1, prep, w2){
 var id, id2;

 switch(verb){

  /* ---- no-noun verbs ---- */
  case "look":     describeRoom(true); return true;
  case "inventory":{
   var inv=inventory();
   if(!inv.length){ say("You are carrying nothing at all, which at least is simple."); return true; }
   say("You are carrying:");
   inv.forEach(function(i){ say("    "+cap(shortName(i))+(worn(i)?"  (worn)":"")); });
   return true;
  }
  case "score":    doScore(); return true;
  case "wait":
   /* waiting out a whole tide one turn at a time is not a puzzle, it is a
      punishment. Aboard the boat, with a crew, WAIT skips to the turn. */
   if(S.room==="deck" && S.tide==="out" && F.boatmanAwake){
    S.tideT = TIDE_PERIOD-1;
    say("You sit down on the thwart beside the boatman and the two of you watch the water, "+
        "which is what he was going to do anyway. He does not make conversation. After a "+
        "long while he takes his pipe out, looks at it, and puts it back.");
    return true;
   }
   say(oneOf([ "Time passes. Not much of it, and nothing does anything with it.",
               "You wait. The sea goes on with its work.",
               "You stand still for a while. It is surprisingly restful." ]));
   return true;
  case "listen":
   say(room().world==="fair"
    ? "Water, ironwork, and a long way off, unmistakably, an organ playing something in three-four."
    : "The shutter ticks as the cold gets into it. Somewhere at the back a fridge you had "+
      "forgotten about is running.");
   return true;
  case "smell":
   say(room().world==="fair" ? "Weed, tar, salt, and naphtha."
                             : "Hot dust and old copper. It is the smell of the whole of your childhood.");
   return true;
  case "jump":  say("You jump on the spot. Nothing is achieved, and if there were anybody here they would ask you why."); return true;
  case "sit":   say("You have things to be getting on with."); return true;
  case "stand": say("You are already standing."); return true;
  case "swear": say("Quite understandable, in the circumstances."); return true;
  case "xyzzy":
   say(F.magicKnown ? "A hollow voice says: \"Wrong word, and wrong pier.\""
                    : "A hollow voice says: \"Not that one.\"");
   return true;
  case "magic": doMagic(); return true;
  case "diagnose":
   say("You are alive, on your feet, and "+(F.deaths? "have died "+F.deaths+" time"+(F.deaths>1?"s":"")+" so far, which the Lost Property Office has been very good about." : "have not yet died, which is going well."));
   return true;
  case "help":    doHelp(); return false;
  case "about":   doAbout(); return false;
  case "hint":
   say(carried("starling") ? starlingHint()
    : "There is no hint system. There is a bird. It is in the bathing hut and it is "+
      "extremely willing to tell you what to do next, at length, whether you want it to or not.");
   return false;
  case "verbose":    MODE="verbose";   say("Full descriptions, every time."); return false;
  case "brief":      MODE="brief";     say("Full descriptions on first visit only."); return false;
  case "superbrief": MODE="superbrief";say("Room names only."); return false;
  case "quit":
   say("You can simply close the page. Nothing here is going anywhere — use Save first if "+
       "you want to come back to it.");
   return false;
  case "restart":
   resetState(); begin(); return false;
  case "save":  say("Use the Save button at the top of the page."); return false;
  case "restore": say("Use the Load button at the top of the page."); return false;
  case "yes":
   if(S.pendingRestart){ revive(); return false; }
   say("You say yes to nobody in particular."); return false;
  case "no":
   if(S.pendingRestart){
    say("The clerk waits. He is extremely good at waiting. (Say YES.)");
    return false;
   }
   say("Fair enough."); return false;

  /* ---- movement ---- */
  case "go": {
   if(!w1.length){ say("Which way?"); return false; }
   var d = DIRS[stripNoise(w1)[0]] || DIRS[w1[0]];
   if(!d){
    /* "go to the booth" — try a room name */
    var r2 = resolve(w1);
    if(r2.dir) d = r2.dir;
   }
   if(!d){ say("You can only go in a direction from here — north, south, east, west, up or down."); return false; }
   if(d==="in"){ return doBoard()!==undefined ? true : true; }
   if(d==="out"){ return go("down"); }
   return go(d);
  }
  case "climb": {
   if(!w1.length) return go("up");
   var dd = DIRS[stripNoise(w1)[0]];
   if(dd) return go(dd);
   return go("up");
  }
  case "swim":
   if(S.room==="sea"){ say("You are doing your best."); return true; }
   if(S.room==="lagoon"){ say("It is four inches deep."); return true; }
   if(room().world==="fair"){ return go("north"); }
   say("There is nothing here to swim in."); return true;

  /* ---- object verbs ---- */
  case "take": {
   if(!w1.length){ say("Take what?"); return false; }
   var groups = splitList(w1);
   if(groups.length>1){
    groups.forEach(function(g){
     var i=need(g,"take");
     if(i&&i.indexOf("@")!==0){ OUT(cap(shortName(i))+": "); doTake(i); }
    });
    return true;
   }
   id = need(w1,"take",{preferHeld:false});
   if(!id) return false;
   if(id==="@ALL"){
    var all=everythingHere();
    if(!all.length){ say("There is nothing here to take."); return true; }
    all.forEach(function(i){ OUT(cap(shortName(i))+": "); doTake(i); });
    return true;
   }
   doTake(id); return true;
  }
  case "drop": {
   if(!w1.length){ say("Drop what?"); return false; }
   var dgroups = splitList(w1);
   if(dgroups.length>1){
    dgroups.forEach(function(g){
     var i=need(g,"drop",{preferHeld:true});
     if(i&&i.indexOf("@")!==0){ OUT(cap(shortName(i))+": "); doDrop(i); }
    });
    return true;
   }
   id = need(w1,"drop",{preferHeld:true});
   if(!id) return false;
   if(id==="@ALL"){
    var inv=inventory();
    if(!inv.length){ say("You are carrying nothing."); return true; }
    inv.forEach(function(i){ OUT(cap(shortName(i))+": "); doDrop(i); });
    return true;
   }
   doDrop(id); return true;
  }
  case "examine":
   id = need(w1,"examine"); if(!id||id.indexOf("@")===0){ if(id==="@ALL"){ say("One at a time."); return true; } return false; }
   doExamine(id); return true;
  case "read":
   id = need(w1,"read"); if(!id||id.indexOf("@")===0) return false;
   doRead(id); return true;
  case "search":
   id = need(w1,"search"); if(!id||id.indexOf("@")===0) return false;
   doSearch(id); return true;
  case "lookunder":
   id = need(w1,"look under"); if(!id||id.indexOf("@")===0) return false;
   doLookUnder(id); return true;
  case "lookin": {
   id = need(w1,"look in"); if(!id||id.indexOf("@")===0) return false;
   if(OBJ[id].container && !OBJ[id].open){ say("It is closed."); return true; }
   doExamine(id); return true;
  }
  case "open":
   id = need(w1,"open"); if(!id||id.indexOf("@")===0) return false;
   if(id==="greendoor"){ say(F.doorOpen?"It is already open.":"It is locked."); return true; }
   doOpen(id); return true;
  case "close":
   id = need(w1,"close"); if(!id||id.indexOf("@")===0) return false;
   doClose(id); return true;
  case "unlock": {
   id = need(w1,"unlock"); if(!id||id.indexOf("@")===0) return false;
   id2 = w2.length ? need(w2,"unlock with") : (carried("keys")?"keys":null);
   if(w2.length && !id2) return false;
   if(!id2){ say("Unlock it with what?"); return true; }
   if(id==="greendoor"){
    if(F.doorOpen){ say("It is already unlocked."); return true; }
    if(id2!=="keys"||!carried("keys")){ say("That will not open this door."); return true; }
    F.doorOpen=true; OBJ.greendoor.locked=false;
    say("The tagged key — GREEN DR., in indelible pencil, written by somebody who was "+
        "coming back on the Monday — turns the rim lock over with a bang you feel through "+
        "the handle. The door swings in on a plank room full of tools.");
    return true;
   }
   doUnlock(id,id2); return true;
  }
  case "lock": say("There is no reason to lock anything, and no time."); return true;
  case "wear":
   id = need(w1,"wear"); if(!id||id.indexOf("@")===0) return false;
   doWear(id); return true;
  case "remove":
   id = need(w1,"take off"); if(!id||id.indexOf("@")===0) return false;
   doRemove(id); return true;
  case "light":
   if(!w1.length){ doLight(null); return true; }
   id = need(w1,"light"); if(!id||id.indexOf("@")===0) return false;
   doLight(id); return true;
  case "unlight":
   if(!w1.length){ doUnlight(null); return true; }
   id = need(w1,"put out"); if(!id||id.indexOf("@")===0) return false;
   doUnlight(id); return true;
  case "blow":
   doUnlight(null); return true;
  case "turn": {
   if(!w1.length){ say("Turn what?"); return false; }
   id = need(w1,"turn"); if(!id||id.indexOf("@")===0) return false;
   if(id==="flare"){ say("Use LIGHT FLARE or UNLIGHT FLARE."); return true; }
   say("It doesn't turn."); return true;
  }
  case "put": {
   if(!w1.length){ say("Put what?"); return false; }
   id = need(w1,"put",{preferHeld:true}); if(!id) return false;
   if(id==="@ALL"){
    var inv2=inventory().slice();
    if(!w2.length){ inv2.forEach(function(i){ OUT(cap(shortName(i))+": "); doDrop(i); }); return true; }
    id2 = need(w2,"put in"); if(!id2) return false;
    inv2.forEach(function(i){ OUT(cap(shortName(i))+": "); doPut(i,id2,prep); });
    return true;
   }
   if(!w2.length){ doDrop(id); return true; }
   id2 = need(w2,"put in"); if(!id2||id2.indexOf("@")===0) return false;
   if(prep==="under"){ say("You can't put things under things here."); return true; }
   doPut(id,id2,prep); return true;
  }
  case "give": {
   if(!w1.length){ say("Give what?"); return false; }
   id = need(w1,"give",{preferHeld:true}); if(!id||id.indexOf("@")===0) return false;
   id2 = w2.length ? need(w2,"give to") : null;
   if(w2.length && !id2) return false;
   if(!id2){
    /* "feed the gulls" / "give the boatman the stout" — infer */
    if(OBJ[id] && OBJ[id].animate){ /* they typed the recipient first */
     var swap=id; id=null;
     var held=inventory();
     if(swap==="gulls" && carried("chips")) { doGive("chips","gulls"); return true; }
     if(swap==="boatman" && carried("stout")){ doGive("stout","boatman"); return true; }
     say("Give what to "+theName(swap)+"?"); return false;
    }
    if(visible("gulls")) { doGive(id,"gulls"); return true; }
    if(visible("boatman")){ doGive(id,"boatman"); return true; }
    say("Give it to whom?"); return false;
   }
   doGive(id,id2); return true;
  }
  case "throw": {
   if(!w1.length){ say("Throw what?"); return false; }
   id = need(w1,"throw",{preferHeld:true}); if(!id||id.indexOf("@")===0) return false;
   if(id==="chips" && visible("gulls")){ doGive("chips","gulls"); return true; }
   if(w2.length){
    id2 = need(w2,"throw at");
    if(!id2||id2.indexOf("@")===0) return false;
    if(OBJ[id2].animate){ doGive(id,id2); return true; }
   }
   if(!carried(id)){ say("You aren't carrying that."); return true; }
   OBJ[id].loc=S.room; OBJ[id].moved=true;
   say("You throw "+theName(id)+" across the room. It lands. That is the whole of it.");
   return true;
  }
  case "push": {
   if(!w1.length){ say("Push what?"); return false; }
   id = need(w1,"push"); if(!id||id.indexOf("@")===0) return false;
   if(id==="prizewallobj"){ pushWall(); return true; }
   if(id==="mat"){ doLookUnder("mat"); return true; }
   doPush(id); return true;
  }
  case "pull": {
   if(!w1.length){ say("Pull what?"); return false; }
   id = need(w1,"pull"); if(!id||id.indexOf("@")===0) return false;
   if(id==="mat"||id==="boltedmat"){ doLookUnder(id); return true; }
   if(id==="prizewallobj"){ pushWall(); return true; }
   say("Pulling "+theName(id)+" does nothing useful."); return true;
  }
  case "wake": {
   if(!w1.length){ say("Wake whom?"); return false; }
   id = need(w1,"wake"); if(!id||id.indexOf("@")===0) return false;
   if(id==="boatman"){ wakeBoatman(); return true; }
   say("That is not asleep."); return true;
  }
  case "build":  doBuild(); return true;
  case "board":
   if(w1.length){
    id = need(w1,"board");
    if(id && id!=="marigold" && id.indexOf("@")!==0){ say("You can't get aboard that."); return true; }
   }
   doBoard(); return true;
  case "disembark":
   if(S.room==="deck"){ enterRoom(F.moored); return true; }
   say("You are not aboard anything."); return true;
  case "weigh":  doWeigh(); return true;
  case "setsail":doSetSail(); return true;
  case "dig":    doDig(); return true;
  case "pace":   doPace(null); return true;
  case "eat": {
   id = need(w1,"eat"); if(!id||id.indexOf("@")===0) return false;
   doEat(id); return true;
  }
  case "attack": {
   id = w1.length ? need(w1,"attack") : null;
   if(w1.length && !id) return false;
   doAttack(id); return true;
  }
  case "touch": {
   id = need(w1,"touch"); if(!id||id.indexOf("@")===0) return false;
   say("You touch "+theName(id)+". It feels the way it looks."); return true;
  }
  case "kiss": {
   id = w1.length? need(w1,"kiss") : null;
   say(id==="starling" ? "The starling permits it, which is more than you deserve."
                       : "This is neither the time nor the object.");
   return true;
  }
  case "ask": {
   if(visible("boatman") && F.boatmanAwake){
    say("\"Chart first,\" says the boatman, \"then the water, then the anchor, then the "+
        "sail. In that order, and not one of them before its turn.\"");
    return true;
   }
   if(carried("starling")){ say(starlingHint()); return true; }
   say("There is nobody here to ask."); return true;
  }
  case "say": {
   var said = w1.concat(w2).join(" ");
   if(said.indexOf("hoopla")>=0){ doMagic(); return true; }
   if(said.indexOf("score")>=0){ doScore(); return true; }
   if(said.indexOf("xyzzy")>=0){ return perform("xyzzy",[],null,[]); }
   if(!said){ say("Say what?"); return false; }
   say("You say \""+said+"\" aloud. Nothing whatever happens, and you feel it.");
   return true;
  }
  case "pick": say("Pick it up, do you mean?"); return false;
  case "set":  say("Set sail, or set something down?"); return false;
  case "undo": say("There is no undo. There is a Save button, and there is the Lost Property Office."); return false;
 }
 say("That isn't a verb this game knows what to do with.");
 return false;
}

/* ---- help / about ---- */
function doHelp(){
 sayp("THE DROWNED FAIR understands whole sentences. Some things it knows how to do:");
 say("");
 say("  Moving      NORTH SOUTH EAST WEST UP DOWN  (or N S E W U D)");
 say("  Looking     LOOK · EXAMINE <thing> · READ <thing> · LOOK UNDER <thing> ·");
 say("              SEARCH <thing> · LISTEN · SMELL");
 say("  Handling    TAKE / DROP / TAKE ALL · PUT <thing> IN <thing> ·");
 say("              GIVE <thing> TO <someone> · OPEN · CLOSE · UNLOCK <thing> WITH <thing>");
 say("  Wearing     WEAR <thing> · TAKE OFF <thing>");
 say("  Light       LIGHT FLARE · UNLIGHT FLARE");
 say("  Work        BUILD BOAT · DIG · WALK 40 PACES · PUSH <thing> · WAKE <someone>");
 say("  Boats       BOARD BOAT · WEIGH ANCHOR · SET SAIL · GET OFF");
 say("  Speaking    SAY <word>");
 say("  Bookkeeping INVENTORY (I) · SCORE · VERBOSE · BRIEF · AGAIN (G) · HELP · ABOUT");
 say("");
 say("You can chain commands: TAKE THE FLARE AND THE MATCHES. GO NORTH. LIGHT THE FLARE.");
 say("IT and THEM refer back to the last thing you mentioned.");
 say("");
 say("There is no hint command. There is a bird.");
}

function doAbout(){
 sayp("THE DROWNED FAIR");
 say("Written for scovert.com in 2026 by Scott Covert.");
 say("");
 say("This is a game of the old school, built on the old two-world grammar — the book in "+
     "the ordinary room, the magic word that carries you between two worlds, the light you "+
     "have to earn and can waste, the bird that clears a hazard, the birds that must be "+
     "bribed, the thing under the floor covering, the ring of keys, the sleeping man who "+
     "wants a drink and becomes your crew, the vehicle assembled from six parts and a "+
     "drawing, the tide, the chart that counts your paces before you dig, and the cabinet "+
     "where prizes are counted.");
 say("");
 say("The town, the pier, the objects, the prose, the five prizes, the scoring and the "+
     "parser are all new. The parser understands rather more than two words at a time, "+
     "because the machines that ran these games could not spare the memory and this one can.");
 say("");
 say("Sarnwick is not a real town. Every pier in this story went into the sea somewhere.");
}

/* ============================================================
   TURN LOOP
   ============================================================ */
function doCommand(cmd){
 var tok = tokenise(cmd);
 /* a leading noise word must go before the verb is looked up, or
    "please pick up the ledger" dies on the word "please" */
 while(tok.length && NOISE.indexOf(tok[0])>=0) tok.shift();
 if(!tok.length) return false;

 /* pending disambiguation: a bare noun phrase answers it */
 if(pendingDisambig){
  var pd=pendingDisambig; pendingDisambig=null;
  if(!findVerb(tok)){
   var pick = resolve(tok);
   if(pick.id && pd.cands.indexOf(pick.id)>=0){
    lastNoun=pick.id;
    return perform(pd.verb, tok, null, []);
   }
  }
 }

 /* "walk 40 paces" / "40 paces" / "count 40 paces" */
 var hasPaces = tok.some(function(t){ return t==="paces"||t==="pace"; });
 if(hasPaces){
  var num=null;
  for(var i=0;i<tok.length;i++) if(/^\d+$/.test(tok[i])) num=parseInt(tok[i],10);
  doPace(num);
  return true;
 }

 var fv = findVerb(tok);
 if(!fv){
  var w=tok[0];
  if(NOUNIDX[w]) say("That is a thing, not something to do. Try a verb first — EXAMINE "+w+", perhaps.");
  else if(sceneryWord(w)) say("That is part of the scenery, and there is no verb here that will help.");
  else say("The word \""+w+"\" isn't one this game knows. Type HELP for the verbs it does.");
  return false;
 }

 var sp = splitPrep(fv.rest);
 var w1 = stripNoise(sp.first);
 var w2 = stripNoise(sp.second);

 /* dig / pace never want a noun */
 if(fv.verb==="dig"){ doDig(); return true; }

 return perform(fv.verb, w1, sp.prep, w2);
}

function turn(line){
 line = normalise(line);
 if(!line){ say("I beg your pardon?"); STATUS(statusObj()); return; }

 if(line==="again"||line==="g"){
  if(!lastCommand){ say("You haven't done anything yet."); STATUS(statusObj()); return; }
  line = lastCommand;
 } else if(line!=="yes"&&line!=="y"&&line!=="no"){
  lastCommand = line;
 }

 var cmds = splitCommands(line);
 for(var i=0;i<cmds.length;i++){
  if(F.won) break;
  var consumed = doCommand(cmds[i]);
  if(consumed && !S.dead && !F.won) daemons();
  if(S.dead) break;
 }
 STATUS(statusObj());
}

/* The map handed to the page only ever names a room you have actually stood in.
   Publishing the far side of an exit you have not walked would hand the player
   the ghost-train maze for nothing. */
function mapGraph(){
 var g={};
 for(var k in S.visited){
  if(!S.visited[k]) continue;
  var ex=ROOMS[k].exits||{}, out={};
  for(var dir in ex){
   if(!ex.hasOwnProperty(dir)) continue;
   var v=ex[dir], dest = (typeof v==="string") ? v : (v.to==="@shore" ? F.moored : v.to);
   if(!dest) continue;
   out[dir] = S.visited[dest] ? dest : null;
  }
  g[k]={ name:ROOMS[k].name, exits:out };
 }
 return g;
}

function statusObj(){
 var r=room();
 var vis=[];
 for(var k in S.visited) if(S.visited[k]) vis.push(ROOMS[k].name);
 return {
  roomId: S.room,
  roomTitle: isDark()? "Darkness" : r.name,
  roomFlavor: isDark()? "You cannot see a thing." : (r.flavor||""),
  carried: inventory().map(function(i){ return cap(shortName(i))+(worn(i)?" (worn)":""); }),
  visited: vis,
  stored: stored().length,
  exits: isDark()? [] : exitList(),
  score: scoreNow(),
  rank: rankFor(scoreNow()),
  turns: S.turns,
  dark: isDark(),
  map: mapGraph()
 };
}

/* ============================================================
   SAVE / RESTORE
   ============================================================ */
function serialize(){
 var locs={}, opens={}, moved={}, locked={};
 for(var k in OBJ){
  if(!OBJ.hasOwnProperty(k)) continue;
  locs[k]=OBJ[k].loc;
  if(OBJ[k].container) opens[k]=!!OBJ[k].open;
  if(OBJ[k].moved) moved[k]=true;
  if(typeof OBJ[k].locked!=="undefined") locked[k]=!!OBJ[k].locked;
 }
 return { v:1, F:JSON.parse(JSON.stringify(F)), S:JSON.parse(JSON.stringify(S)),
          WORN:JSON.parse(JSON.stringify(WORN)), locs:locs, opens:opens,
          moved:moved, locked:locked, mode:MODE };
}

function restore(d){
 if(!d||d.v!==1) throw new Error("bad save");
 resetState();
 F=d.F; S=d.S; WORN=d.WORN||{}; MODE=d.mode||"verbose";
 for(var k in d.locs){
  if(!OBJ[k]) continue;
  OBJ[k].loc=d.locs[k];
  if(d.opens && typeof d.opens[k]!=="undefined") OBJ[k].open=d.opens[k];
  if(d.moved && d.moved[k]) OBJ[k].moved=true;
  if(d.locked && typeof d.locked[k]!=="undefined") OBJ[k].locked=d.locked[k];
 }
 updateTideObjects();
 STATUS(statusObj());
}

/* ============================================================
   BOOT
   ============================================================ */
function begin(){
 resetState();
 OUT("THE DROWNED FAIR\n","head");
 say("An adventure of the old school, told at rather greater length.");
 say("Copyright 2026 Scott Covert.");
 OUT("","sep");
 say("");
 say("It is a Tuesday afternoon in November and you are minding your uncle's amusement "+
     "arcade, which is shut. You have swept it twice. You have counted the float. You have "+
     "been through the lost-property box and found four gloves, none of them a pair.");
 say("");
 say("There are three hours to go.");
 describeRoom(true);
 STATUS(statusObj());
}

function init(cfg){
 OUT = function(t,style){ cfg.print(t,style); };
 STATUS = cfg.status || function(){};
}

/* ============================================================
   PUBLIC
   ============================================================ */
return {
 init:init, begin:begin, turn:turn, serialize:serialize, restore:restore,
 /* test hooks */
 _t:{
  get room(){ return S.room; }, set room(v){ S.room=v; },
  get flags(){ return F; },
  get state(){ return S; },
  get obj(){ return OBJ; },
  get rooms(){ return ROOMS; },
  get worn(){ return WORN; },
  score:function(){ return scoreNow(); },
  stored:function(){ return stored(); },
  rank:rankFor,
  carrying:function(){ return inventory(); },
  visible:visible,
  isDark:isDark,
  status:statusObj,
  treasures:TREASURES,
  boatParts:BOAT_PARTS,
  reset:resetState
 }
};
})();

if(typeof module!=="undefined" && module.exports) module.exports = DF;
