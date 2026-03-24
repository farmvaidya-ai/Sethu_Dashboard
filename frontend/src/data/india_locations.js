// India Administrative Divisions - Focused on AP/TG for FarmVaidya
export const STATES = [
    "Andhra Pradesh", "Telangana", "Karnataka", "Tamil Nadu", "Maharashtra", 
    "Kerala", "Gujarat", "Rajasthan", "Madhya Pradesh", "Uttar Pradesh", "Bihar", 
    "West Bengal", "Punjab", "Haryana", "Delhi", "Other"
];

export const DISTRICTS = {
    "Andhra Pradesh": [
        "Anantapur", "Chittoor", "East Godavari", "Guntur", "Krishna", "Kurnool", "Nellore", "Prakasam", 
        "Srikakulam", "Visakhapatnam", "Vizianagaram", "West Godavari", "YSR Kadapa", "Anakapalli",
        "Bapatla", "Eluru", "Kakinada", "Konaseema", "Nanyala", "Palnadu", "Parvathipuram Manyam",
        "Sri Satya Sai", "Tirupati", "NTR"
    ],
    "Telangana": [
        "Adilabad", "Bhadradri Kothagudem", "Hyderabad", "Jagtial", "Jangaon", "Jayashankar Bhupalpally", 
        "Jogulamba Gadwal", "Kamareddy", "Karimnagar", "Khammam", "Kumuram Bheem Asifabad", "Mahabubabad", 
        "Mahabubnagar", "Mancherial", "Medak", "Medchal-Malkajgiri", "Mulugu", "Nagarkurnool", "Nalgonda", 
        "Narayanpet", "Nirmal", "Nizamabad", "Peddapalli", "Rajanna Sircilla", "Ranga Reddy", "Sangareddy", 
        "Siddipet", "Suryapet", "Vikarabad", "Wanaparthy", "Warangal", "Hanamkonda", "Yadadri Bhuvanagiri"
    ],
    "Karnataka": ["Bangalore Urban", "Bangalore Rural", "Mysore", "Hubli-Dharwad", "Mangalore", "Belgaum", "Gulbarga", "Shimoga", "Bellary", "Bijapur"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli", "Erode", "Vellore", "Thoothukudi", "Nagercoil"],
    "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Thane", "Nashik", "Aurangabad", "Solapur", "Amravati", "Navi Mumbai", "Kolhapur"]
};

// Generic Mandals/Talukas per region
export const MANDALS = {
    "Hyderabad": ["Ameerpet", "Banjara Hills", "Jubilee Hills", "Kukatpally", "Miyapur", "Gachibowli", "Secunderabad", "Himayat Nagar", "Abids"],
    "Guntur": ["Guntur City", "Tenali", "Narasaraopet", "Mangalagiri", "Ponnur", "Bapatla", "Repalle", "Chilakaluripet"],
    "Krishna": ["Vijayawada", "Machilipatnam", "Gudivada", "Nuzvid", "Jaggaiahpeta", "Vuyyuru"],
    "Visakhapatnam": ["Vizag City", "Gajuwaka", "Anakapalle", "Bheemunipatnam", "Pendurthi", "Madurawada"],
    "Ranga Reddy": ["Serilingampally", "Rajendranagar", "Saroornagar", "Hayathnagar", "Maheshwaram", "Ibrahimpatnam"],
    "Medchal-Malkajgiri": ["Uppal", "Malkajgiri", "Alwal", "Quthbullapur", "Balanagar", "Kapra"]
};

// Generic Villages per Mandal
export const VILLAGES = {
    "Ameerpet": ["Srinagar Colony", "Yousufguda", "Balkampet", "Maitrivanam"],
    "Tenali": ["Nandivelugu", "Angalakuduru", "Kothapet", "Pinapadu"],
    "Kukatpally": ["KPHB Phase 1", "Vivekananda Nagar", "Moosapet", "Bhagyanagar Colony"],
    "Gachibowli": ["DLF Road", "Rolling Hills", "Financial District"],
    "Vizag City": ["RK Beach Area", "MVP Colony", "Siripuram", "Kancharapalem"],
    "Vijayawada": ["Benz Circle", "Governorpet", "Patamata", "One Town"]
};
