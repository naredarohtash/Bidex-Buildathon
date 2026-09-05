"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COUNTRY_WEIGHTS = exports.HANDLE_SUFFIXES = exports.REGIONAL_POOLS = exports.NAMES = void 0;
exports.NAMES = {
    IN_NORTH: {
        male: [
            "Aarav", "Rahul", "Amit", "Rajesh", "Vikram", "Manish", "Deepak", "Anil", "Sandeep", "Ajay",
            "Nitin", "Gaurav", "Harsh", "Yash", "Kunal", "Ankit", "Abhishek", "Varun", "Rohit",
            "Saurabh", "Vishal", "Nikhil", "Akash", "Tarun", "Mohit", "Rakesh", "Vivek", "Pankaj",
            "Sumit", "Ashish",
        ],
        female: [
            "Neha", "Pooja", "Priya", "Riya", "Sneha", "Swati", "Divya", "Anjali", "Shreya", "Nisha",
            "Rekha", "Sunita", "Aditi", "Ananya", "Ishita", "Kavya", "Preeti", "Ritu", "Shalini",
            "Megha",
        ],
        last: [
            "Sharma", "Verma", "Gupta", "Singh", "Kumar", "Yadav", "Mishra", "Tiwari", "Pandey",
            "Agarwal", "Bansal", "Malhotra", "Kapoor", "Chopra", "Khanna", "Bhatia", "Sethi", "Arora",
            "Saini", "Chauhan", "Rathore", "Shukla", "Dubey", "Thakur", "Jain", "Goyal", "Sinha",
            "Srivastava", "Rastogi", "Sood",
        ],
    },
    IN_SOUTH: {
        male: [
            "Karthik", "Praveen", "Naveen", "Suresh", "Ramesh", "Arjun", "Sai", "Vignesh", "Hari",
            "Bharath", "Ganesh", "Mahesh", "Srinivas", "Anand", "Kiran", "Dinesh", "Sathish", "Vinod",
            "Prakash", "Manoj",
        ],
        female: [
            "Divya", "Lakshmi", "Meera", "Vaishnavi", "Anitha", "Kavitha", "Sowmya", "Deepika",
            "Bhavani", "Padma",
        ],
        last: [
            "Iyer", "Nair", "Menon", "Pillai", "Reddy", "Rao", "Naidu", "Krishnan", "Subramanian",
            "Raman", "Varma", "Chandran", "Sundaram", "Murthy", "Prasad", "Shetty", "Hegde", "Acharya",
            "Bhat", "Kamath",
        ],
    },
    IN_BENGAL: {
        male: [
            "Arijit", "Soumya", "Debashis", "Sourav", "Subhash", "Anirban", "Pritam", "Sandip", "Tapas",
            "Bikram",
        ],
        female: [
            "Ananya", "Rituparna", "Moumita", "Piyali", "Sharmistha", "Debjani", "Sohini", "Ruma",
        ],
        last: [
            "Banerjee", "Chatterjee", "Mukherjee", "Das", "Ghosh", "Bose", "Sen", "Dutta", "Roy",
            "Sarkar", "Chakraborty", "Bhattacharya", "Majumdar", "Nandi", "Halder",
        ],
    },
    IN_MARATHI: {
        male: [
            "Swapnil", "Omkar", "Sagar", "Ketan", "Mangesh", "Nilesh", "Amol", "Sachin", "Rohan",
            "Prathamesh",
        ],
        female: [
            "Snehal", "Pallavi", "Rutuja", "Mayuri", "Shruti", "Ashwini", "Vaishali",
        ],
        last: [
            "Kulkarni", "Deshpande", "Jadhav", "Patil", "Shinde", "Gaikwad", "More", "Pawar", "Joshi",
            "Bhosale", "Sawant", "Kadam", "Salunkhe", "Chavan",
        ],
    },
    IN_GUJARAT: {
        male: [
            "Jignesh", "Bhavesh", "Hardik", "Chirag", "Nilesh", "Mihir", "Ronak", "Parth", "Dhruv",
            "Kalpesh",
        ],
        female: [
            "Krupa", "Hetal", "Falguni", "Bhoomi", "Nidhi", "Rachana",
        ],
        last: [
            "Patel", "Shah", "Mehta", "Desai", "Trivedi", "Modi", "Bhatt", "Parikh", "Vyas", "Thakkar",
            "Panchal", "Amin",
        ],
    },
    PK: {
        male: [
            "Muhammad", "Ahmed", "Ali", "Hassan", "Bilal", "Usman", "Farhan", "Imran", "Kamran", "Adnan",
            "Faisal", "Asad", "Zeeshan", "Shahzad", "Tariq", "Nadeem", "Rizwan", "Waqar", "Junaid",
            "Saad", "Hamza", "Umar", "Talha", "Rehan", "Danish", "Salman", "Owais", "Shoaib", "Fahad",
            "Arsalan",
        ],
        female: [
            "Ayesha", "Fatima", "Sana", "Hira", "Maryam", "Zainab", "Amna", "Iqra", "Nimra", "Rabia",
            "Sadia", "Kiran", "Farah", "Nida", "Sidra", "Areeba", "Mahnoor", "Hafsa",
        ],
        last: [
            "Khan", "Ahmed", "Ali", "Hussain", "Malik", "Butt", "Shaikh", "Qureshi", "Chaudhry", "Raza",
            "Iqbal", "Javed", "Aslam", "Nawaz", "Abbasi", "Baig", "Mirza", "Siddiqui", "Farooq",
            "Rashid", "Hashmi", "Gilani", "Bhatti", "Rehman", "Anwar", "Sultan", "Zafar", "Nasir",
            "Akhtar", "Saeed",
        ],
    },
    BD: {
        male: [
            "Rakib", "Sabbir", "Tanvir", "Mahmud", "Arif", "Jahid", "Nasir", "Rubel", "Sohel", "Zahidul",
            "Mizanur", "Shafiq", "Anwar", "Rafiq", "Faruk", "Shakil", "Masud", "Habib", "Jasim",
            "Kamrul", "Rasel", "Sumon", "Emon", "Naim", "Sajib", "Ripon", "Milon", "Tuhin",
        ],
        female: [
            "Nasrin", "Sumaiya", "Taslima", "Farhana", "Nusrat", "Sharmin", "Shabnam", "Mousumi",
            "Rumana", "Jesmin",
        ],
        last: [
            "Islam", "Hossain", "Rahman", "Ahmed", "Chowdhury", "Sarker", "Miah", "Uddin", "Alam",
            "Hoque", "Molla", "Talukder", "Bhuiyan", "Mondal", "Sheikh", "Khan", "Das", "Roy", "Karim",
            "Haque", "Sarkar", "Biswas",
        ],
    },
    NP: {
        male: [
            "Bikash", "Suman", "Sandeep", "Prakash", "Ramesh", "Bibek", "Nabin", "Anil", "Santosh",
            "Deepak", "Rajesh", "Kiran", "Sabin", "Rojan", "Sujan", "Milan", "Dipesh", "Ashish", "Niraj",
            "Saroj",
        ],
        female: [
            "Sita", "Sunita", "Anjana", "Pooja", "Sarita", "Nirmala", "Manisha", "Sabina", "Rita",
            "Bimala",
        ],
        last: [
            "Shrestha", "Thapa", "Gurung", "Magar", "Tamang", "Rai", "Limbu", "Sherpa", "Adhikari",
            "Poudel", "Bhattarai", "Karki", "Subedi", "Acharya", "Khadka", "Basnet", "Pandey", "Joshi",
            "Maharjan", "Dhakal", "Lamichhane", "Bhandari", "Regmi", "Ghimire",
        ],
    },
    AF: {
        male: [
            "Ahmad", "Mohammad", "Abdul", "Zabihullah", "Najibullah", "Farhad", "Hamid", "Jamshid",
            "Naveed", "Wahid", "Rahmatullah", "Sayed", "Bashir", "Zia", "Khalid", "Omid", "Rohullah",
            "Ehsan", "Mustafa", "Yasin",
        ],
        female: [
            "Fariba", "Marzia", "Zarghona", "Nadia", "Shakila", "Farzana", "Hosai", "Latifa",
        ],
        last: [
            "Ahmadi", "Rahimi", "Karimi", "Noori", "Hashimi", "Sadat", "Wardak", "Popal", "Stanikzai",
            "Zadran", "Amiri", "Faizi", "Nazari", "Yousufi", "Rasooli", "Safi", "Barakzai", "Durrani",
            "Sherzai", "Alizai",
        ],
    },
    LK: {
        male: [
            "Kasun", "Nuwan", "Chamara", "Dilshan", "Sanjaya", "Tharindu", "Ruwan", "Lahiru", "Isuru",
            "Prasad", "Nimal", "Sunil", "Chathura", "Dinesh", "Roshan", "Supun", "Janaka", "Buddhika",
        ],
        female: [
            "Dilani", "Nadeeka", "Chathurika", "Ishara", "Sachini", "Hasini", "Nayomi", "Thilini",
        ],
        last: [
            "Perera", "Fernando", "Silva", "Jayawardena", "Bandara", "Wickramasinghe", "Rajapaksa",
            "Gunasekara", "Dissanayake", "Herath", "Weerasinghe", "Ranasinghe", "Samarasinghe",
            "Karunaratne", "Ekanayake", "Senanayake",
        ],
    },
    MM: {
        male: [
            "Aung", "Kyaw", "Zaw", "Thura", "Myo", "Htet", "Nay", "Thet", "Win", "Soe", "Phyo", "Kaung",
        ],
        female: [
            "Hla", "Zin", "Ei", "Thida", "Nwe", "Yin", "Khin", "Mya",
        ],
        last: [
            "Aung", "Oo", "Myint", "Htun", "Lwin", "Naing", "Kyi", "Mon", "Moe", "Thein", "Zaw",
            "Hlaing",
        ],
    },
    BT: {
        male: [
            "Karma", "Sonam", "Tashi", "Pema", "Ugyen", "Tenzin", "Jigme", "Kinley",
        ],
        female: [
            "Choki", "Deki", "Dechen", "Tshomo",
        ],
        last: [
            "Wangchuk", "Dorji", "Tshering", "Namgyel", "Wangmo", "Zangmo", "Gyeltshen", "Penjor",
        ],
    },
    MV: {
        male: [
            "Ahmed", "Ibrahim", "Mohamed", "Hassan", "Ali", "Hussain", "Adam",
        ],
        female: [
            "Aishath", "Fathimath", "Mariyam", "Aminath",
        ],
        last: [
            "Didi", "Saeed", "Naseem", "Rasheed", "Latheef", "Shareef", "Waheed", "Nazeer",
        ],
    },
    ID: {
        male: [
            "Budi", "Agus", "Dedi", "Rizky", "Andi", "Bayu", "Eko", "Joko", "Wahyu", "Fajar", "Rudi",
            "Hendra", "Yusuf", "Iwan", "Dimas",
        ],
        female: [
            "Siti", "Dewi", "Ayu", "Putri", "Rina", "Indah", "Sri",
        ],
        last: [
            "Santoso", "Wijaya", "Saputra", "Pratama", "Hidayat", "Nugroho", "Setiawan", "Kurniawan",
            "Susanto", "Halim", "Gunawan", "Suryadi", "Firmansyah", "Ramadhan",
        ],
    },
    PH: {
        male: [
            "Juan", "Jose", "Mark", "John", "Michael", "Angelo", "Christian", "Paolo", "Joshua",
            "Rommel",
        ],
        female: [
            "Maria", "Ana", "Grace", "Jasmine", "Cristina", "Rowena", "Lorna", "Joy",
        ],
        last: [
            "Santos", "Reyes", "Cruz", "Bautista", "Garcia", "Mendoza", "Torres", "Ramos", "Aquino",
            "Villanueva", "Dela Cruz", "Castillo", "Flores", "Rivera",
        ],
    },
    VN: {
        order: "last-first",
        male: [
            "Hùng", "Dũng", "Nam", "Tuấn", "Sơn", "Long", "Hải", "Khánh", "Thắng", "Phong",
        ],
        female: [
            "Linh", "Hương", "Trang", "Mai", "Thanh", "Anh",
        ],
        last: [
            "Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Bùi", "Đặng", "Vũ", "Đỗ", "Ngô", "Dương", "Lý",
        ],
        middleMale: [
            "Văn", "Hữu", "Minh", "Quang", "Đức",
        ],
        middleFemale: [
            "Thị", "Ngọc", "Thanh", "Kim",
        ],
    },
    TH: {
        male: [
            "Somchai", "Somsak", "Anan", "Chaiwat", "Narong", "Suthep", "Kittipong", "Nattapong",
            "Wichai", "Prasit",
        ],
        female: [
            "Siriporn", "Wanida", "Napaporn", "Suchada", "Kanya", "Pimchanok",
        ],
        last: [
            "Saetang", "Chaiyaporn", "Wongsawat", "Srisuk", "Thongchai", "Boonmee", "Rattanakorn",
            "Sukhum", "Phanit", "Intra",
        ],
    },
    MY: {
        male: [
            "Ahmad", "Mohd", "Faizal", "Hafiz", "Syafiq", "Amir", "Zul", "Haziq",
        ],
        female: [
            "Nurul", "Siti", "Aina", "Farah",
        ],
        last: [
            "Abdullah", "Ismail", "Rahman", "Yusof", "Hashim", "Zainal", "Osman", "Ibrahim", "Salleh",
            "Aziz",
        ],
    },
    AE: {
        male: [
            "Mohammed", "Abdullah", "Khalid", "Faisal", "Omar", "Yousef", "Saeed", "Sultan", "Hamad",
        ],
        female: [
            "Noura", "Aisha", "Mariam", "Fatma",
        ],
        last: [
            "Al Kaabi", "Al Mansouri", "Al Nuaimi", "Al Suwaidi", "Al Marzooqi", "Al Zaabi", "Al Shamsi",
            "Al Balushi",
        ],
    },
    SA: {
        male: [
            "Abdulaziz", "Fahad", "Turki", "Bandar", "Majed", "Nawaf", "Saud", "Rayan",
        ],
        female: [
            "Layla", "Reem", "Sara", "Haya",
        ],
        last: [
            "Al Otaibi", "Al Qahtani", "Al Ghamdi", "Al Harbi", "Al Dossari", "Al Shehri", "Al Zahrani",
            "Al Farsi",
        ],
    },
    EG: {
        male: [
            "Ahmed", "Mahmoud", "Mostafa", "Karim", "Youssef", "Amr", "Tarek", "Hany",
        ],
        female: [
            "Dalia", "Nour", "Heba", "Yasmine",
        ],
        last: [
            "Hassan", "Mahmoud", "Fahmy", "Sabry", "Nassar", "Ibrahim", "Abdelrahman", "El Sayed",
            "Mansour", "Fouad",
        ],
    },
    NG: {
        male: [
            "Chinedu", "Emeka", "Ifeanyi", "Oluwaseun", "Adebayo", "Tunde", "Musa", "Segun",
        ],
        female: [
            "Ngozi", "Amaka", "Blessing", "Chioma",
        ],
        last: [
            "Okafor", "Okonkwo", "Adeyemi", "Balogun", "Eze", "Nwosu", "Afolabi", "Obi", "Adewale",
            "Uche",
        ],
    },
    KE: {
        male: [
            "Kamau", "Otieno", "Mwangi", "Brian", "Kevin", "Collins",
        ],
        female: [
            "Wanjiku", "Njeri", "Achieng", "Faith", "Mercy",
        ],
        last: [
            "Kamau", "Mwangi", "Otieno", "Ochieng", "Wanjiru", "Kimani", "Njoroge", "Odhiambo", "Mutua",
            "Chebet",
        ],
    },
    ZA: {
        male: [
            "Sipho", "Thabo", "Bongani", "Andile", "Kagiso",
        ],
        female: [
            "Lerato", "Nomsa", "Zanele",
        ],
        last: [
            "Nkosi", "Dlamini", "Mokoena", "Khumalo", "Ndlovu", "Zulu", "Mabaso", "Sithole",
        ],
    },
    BR: {
        male: [
            "André", "Lucas", "Rafael", "Bruno", "Thiago", "Gabriel", "Felipe", "Mateus",
        ],
        female: [
            "Camila", "Juliana", "Fernanda", "Beatriz",
        ],
        last: [
            "Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira", "Costa", "Almeida", "Machado",
            "Barbosa",
        ],
    },
    TR: {
        male: [
            "Mehmet", "Mustafa", "Emre", "Burak", "Serkan", "Kaan",
        ],
        female: [
            "Elif", "Zeynep", "Merve", "Ayşe",
        ],
        last: [
            "Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Aydın", "Öztürk", "Arslan", "Doğan",
        ],
    },
    RU: {
        feminiseSurname: true,
        male: [
            "Dmitry", "Sergey", "Alexey", "Ivan", "Andrey", "Maxim",
        ],
        female: [
            "Olga", "Elena", "Anna", "Natalia",
        ],
        last: [
            "Ivanov", "Smirnov", "Kuznetsov", "Popov", "Sokolov", "Volkov", "Petrov", "Morozov",
        ],
    },
    GB: {
        male: [
            "James", "Oliver", "Harry", "Jack", "Thomas", "Daniel",
        ],
        female: [
            "Anya", "Emily", "Sophie", "Charlotte",
        ],
        last: [
            "Smith", "Jones", "Taylor", "Brown", "Wilson", "Evans", "Roberts", "Walker", "Hughes",
            "Clarke",
        ],
    },
    DE: {
        male: [
            "Lukas", "Jonas", "Felix", "Maximilian", "Tobias", "Stefan",
        ],
        female: [
            "Lisa", "Anna", "Julia", "Laura",
        ],
        last: [
            "Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Hofmann", "Wagner", "Becker",
            "Schulz", "Koch",
        ],
    },
    NL: {
        male: [
            "Daan", "Sem", "Bram", "Thijs", "Jeroen",
        ],
        female: [
            "Roos", "Lotte", "Sanne",
        ],
        last: [
            "de Vries", "van der Laan", "Jansen", "Bakker", "Visser", "van Dijk", "de Boer", "Mulder",
        ],
    },
    PL: {
        feminiseSurname: true,
        male: [
            "Jakub", "Piotr", "Marcin", "Tomasz", "Michał",
        ],
        female: [
            "Anna", "Katarzyna", "Magdalena",
        ],
        last: [
            "Nowak", "Kowalski", "Wiśniewski", "Wójcik", "Kamiński", "Lewandowski", "Zieliński",
            "Szymański",
        ],
    },
    UA: {
        male: [
            "Oleksandr", "Andriy", "Dmytro", "Serhiy", "Vitaliy",
        ],
        female: [
            "Iryna", "Oksana", "Kateryna",
        ],
        last: [
            "Shevchenko", "Kovalenko", "Bondarenko", "Tkachenko", "Kravchenko", "Melnyk", "Boyko",
            "Moroz",
        ],
    },
    CN: {
        order: "last-first",
        male: [
            "Wei", "Hao", "Lei", "Feng", "Tao",
        ],
        female: [
            "Jing", "Min", "Yan", "Ping", "Xin",
        ],
        last: [
            "Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhao", "Wu", "Zhou",
        ],
    },
    UZ: {
        male: [
            "Bekzod", "Jasur", "Sardor", "Aziz", "Shohrux",
        ],
        female: [
            "Dilnoza", "Nilufar", "Umida",
        ],
        last: [
            "Karimov", "Rakhimov", "Yusupov", "Nazarov", "Ergashev", "Sultonov", "Qodirov",
        ],
    },
};
exports.REGIONAL_POOLS = {
    IN: [
        ["IN_NORTH", 42],
        ["IN_SOUTH", 24],
        ["IN_BENGAL", 12],
        ["IN_MARATHI", 12],
        ["IN_GUJARAT", 10],
    ],
};
exports.HANDLE_SUFFIXES = [
    "FX", "Trader", "Trades", "Trading", "Pro", "Options", "Signals", "Binary", "Capital", "Markets",
];
exports.COUNTRY_WEIGHTS = [
    ["IN", 320],
    ["PK", 140],
    ["BD", 120],
    ["NP", 58],
    ["LK", 38],
    ["AF", 34],
    ["MM", 16],
    ["BT", 7],
    ["MV", 6],
    ["ID", 30],
    ["PH", 26],
    ["VN", 26],
    ["TH", 18],
    ["MY", 16],
    ["AE", 18],
    ["SA", 14],
    ["EG", 14],
    ["NG", 14],
    ["KE", 10],
    ["ZA", 6],
    ["BR", 10],
    ["TR", 9],
    ["RU", 7],
    ["UZ", 6],
    ["GB", 6],
    ["DE", 5],
    ["NL", 4],
    ["PL", 4],
    ["UA", 4],
    ["CN", 4],
];
