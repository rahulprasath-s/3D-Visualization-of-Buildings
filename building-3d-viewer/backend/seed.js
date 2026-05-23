const mongoose = require('mongoose');
const Building = require('./models/Building');
require('dotenv').config();

const seedData = [
  {
    name: "Nuremberg Castle (Kaiserburg)",
    address: "Burg 17, 90403 Nürnberg, Germany",
    description: "Imperial castle and one of the most important medieval fortresses in Europe, dominating the old town skyline.",
    coordinates: { type: "Point", coordinates: [11.0754, 49.4578] },
    floors: 4, area: 120000, yearBuilt: 1050,
    amenities: ["Museum", "Viewpoint", "Gardens", "Deep Well", "Chapel"]
  },
  {
    name: "Frauenkirche",
    address: "Hauptmarkt 14, 90403 Nürnberg, Germany",
    description: "Iconic gothic church on the central market square, built by Holy Roman Emperor Charles IV.",
    coordinates: { type: "Point", coordinates: [11.0782, 49.4539] },
    floors: 1, area: 45000, yearBuilt: 1358,
    amenities: ["Historical Site", "Organ", "Tower", "Crypt"]
  },
  {
    name: "DB Museum",
    address: "Lessingstraße 6, 90443 Nürnberg, Germany",
    description: "One of the oldest technical history museums in Europe, dedicated to the history of German railways.",
    coordinates: { type: "Point", coordinates: [11.0743, 49.4455] },
    floors: 3, area: 60000, yearBuilt: 1899,
    amenities: ["Cafeteria", "Exhibitions", "Gift Shop", "Parking"]
  },
  {
    name: "Stadtmuseum Fembohaus",
    address: "Burgstraße 15, 90403 Nürnberg, Germany",
    description: "One of the last well-preserved Renaissance merchant houses in Nuremberg, housing the city museum.",
    coordinates: { type: "Point", coordinates: [11.0772, 49.4563] },
    floors: 5, area: 22000, yearBuilt: 1591,
    amenities: ["Museum", "City History", "Medieval Exhibits", "Gift Shop"]
  },
  {
    name: "St. Sebaldus Church",
    address: "Albrecht-Dürer-Platz 1, 90403 Nürnberg, Germany",
    description: "One of the two main Lutheran parish churches of Nuremberg, a masterpiece of Gothic architecture.",
    coordinates: { type: "Point", coordinates: [11.0775, 49.4557] },
    floors: 1, area: 55000, yearBuilt: 1230,
    amenities: ["Historical Site", "Shrine of St. Sebaldus", "Tower Climb", "Organ"]
  },
  {
    name: "St. Lorenz Church",
    address: "Lorenzplatz 10, 90402 Nürnberg, Germany",
    description: "Large Gothic church south of the Pegnitz river with a magnificent rose window and twin towers.",
    coordinates: { type: "Point", coordinates: [11.0784, 49.4517] },
    floors: 1, area: 68000, yearBuilt: 1270,
    amenities: ["Historical Site", "Rose Window", "Twin Towers", "Organ", "Art Collection"]
  },
  {
    name: "Albrecht Dürer House",
    address: "Albrecht-Dürer-Straße 39, 90403 Nürnberg, Germany",
    description: "Late Gothic house where the famous painter Albrecht Dürer lived and worked for most of his life.",
    coordinates: { type: "Point", coordinates: [11.0742, 49.4566] },
    floors: 4, area: 8000, yearBuilt: 1420,
    amenities: ["Museum", "Printing Press", "Artist Studio", "Gift Shop"]
  },
  {
    name: "Germanisches Nationalmuseum",
    address: "Kartäusergasse 1, 90402 Nürnberg, Germany",
    description: "Germany's largest museum of cultural history, with over 1.3 million objects spanning 2000 years.",
    coordinates: { type: "Point", coordinates: [11.0757, 49.4493] },
    floors: 3, area: 180000, yearBuilt: 1852,
    amenities: ["Restaurant", "Library", "Shop", "Guided Tours", "Temporary Exhibitions", "Parking"]
  },
  {
    name: "Nuremberg Town Hall (Rathaus)",
    address: "Rathausplatz 2, 90403 Nürnberg, Germany",
    description: "Historic city hall complex combining Gothic and Renaissance elements in the heart of the old town.",
    coordinates: { type: "Point", coordinates: [11.0776, 49.4549] },
    floors: 4, area: 40000, yearBuilt: 1332,
    amenities: ["Council Chambers", "Dungeons", "Historical Archive", "Public Access"]
  },
  {
    name: "Nuremberg Opera House (Staatstheater)",
    address: "Richard-Wagner-Platz 2-10, 90443 Nürnberg, Germany",
    description: "Majestic neo-baroque state theatre, one of the largest opera houses in Germany.",
    coordinates: { type: "Point", coordinates: [11.0697, 49.4490] },
    floors: 5, area: 95000, yearBuilt: 1905,
    amenities: ["Main Stage", "Chamber Theatre", "Box Office", "Cloakroom", "Restaurant", "Parking"]
  },
  {
    name: "Zeppelin Field Grandstand",
    address: "Zeppelinstraße 100, 90471 Nürnberg, Germany",
    description: "Historic Nazi-era monumental grandstand at the former Nazi party rally grounds, now a memorial site.",
    coordinates: { type: "Point", coordinates: [11.1220, 49.4286] },
    floors: 3, area: 500000, yearBuilt: 1937,
    amenities: ["Documentation Centre", "Museum", "Guided Tours", "Memorial"]
  },
  {
    name: "Memorium Nuremberg Trials",
    address: "Bärenschanzstraße 72, 90429 Nürnberg, Germany",
    description: "Courtroom 600, the original venue of the Nuremberg Trials after WWII, now a permanent exhibition.",
    coordinates: { type: "Point", coordinates: [11.0484, 49.4582] },
    floors: 4, area: 35000, yearBuilt: 1916,
    amenities: ["Museum", "Guided Tours", "Library", "Courtroom Access", "Gift Shop"]
  },
  {
    name: "Handwerkerhof Nuremberg",
    address: "Königstraße 82, 90402 Nürnberg, Germany",
    description: "Recreated medieval craftsmen's courtyard near the city walls showcasing traditional Nuremberg trades.",
    coordinates: { type: "Point", coordinates: [11.0775, 49.4481] },
    floors: 2, area: 12000, yearBuilt: 1971,
    amenities: ["Craft Workshops", "Restaurants", "Gift Shops", "Gingerbread", "Toy Making"]
  },
  {
    name: "Nuremberg Central Station (Hauptbahnhof)",
    address: "Bahnhofsplatz 9, 90443 Nürnberg, Germany",
    description: "Historic main railway terminus of Nuremberg, a grand early 20th century stone edifice.",
    coordinates: { type: "Point", coordinates: [11.0820, 49.4456] },
    floors: 3, area: 220000, yearBuilt: 1906,
    amenities: ["Shops", "Restaurants", "Luggage Storage", "Taxi", "Bus Terminal", "Parking"]
  },
  {
    name: "Heilig-Geist-Spital (Holy Ghost Hospital)",
    address: "Spitalgasse 16, 90403 Nürnberg, Germany",
    description: "14th-century Gothic hospital complex straddling the Pegnitz river, one of the largest medieval hospitals.",
    coordinates: { type: "Point", coordinates: [11.0797, 49.4528] },
    floors: 3, area: 30000, yearBuilt: 1332,
    amenities: ["Restaurant", "River View", "Historical Architecture", "Events Hall"]
  },
  {
    name: "Neues Museum Nürnberg",
    address: "Luitpoldstraße 5, 90402 Nürnberg, Germany",
    description: "State museum for art and design with a striking glass facade, featuring modern and contemporary works.",
    coordinates: { type: "Point", coordinates: [11.0763, 49.4480] },
    floors: 4, area: 25000, yearBuilt: 2000,
    amenities: ["Café", "Design Collection", "Contemporary Art", "Shop", "Roof Terrace"]
  },
];

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/buildings_3d')
  .then(async () => {
    console.log('MongoDB connected for seeding');
    await Building.deleteMany({});
    console.log('Cleared existing buildings');
    const result = await Building.insertMany(seedData);
    console.log(`✅ Inserted ${result.length} Nuremberg buildings`);
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('Seeding error:', err);
    process.exit(1);
  });
