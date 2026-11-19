// นำเข้าเฉพาะ Firebase Core และ Firestore (เอา Storage ออกทั้งหมด)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDOwbbJyTjElBbRD--ZJoxBYFUFXEs6ahs",
  authDomain: "expense-tracker-dd89a.firebaseapp.com",
  projectId: "expense-tracker-dd89a",
  storageBucket: "expense-tracker-dd89a.firebasestorage.app",
  messagingSenderId: "702104768572",
  appId: "1:702104768572:web:bc092ce6a43c79c7d5b339"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// State Variables
let allTx = [], wallets = [], categories = [], goals = [];
let currentDate = new Date();
let BUDGET = 15000;
let selectedWalletFilter = "all";
let txType = 'expense';
let pieChartInst = null, barChartInst = null;
let currentUser = localStorage.getItem('family_username'); 

// ==========================================
// 1. ระบบ Login & UI UX 
// ==========================================
const loginScreen = document.getElementById('login-screen');
const loginForm = document.getElementById('login-form');
const loginInput = document.getElementById('login-input');
const displayUsername = document.getElementById('display-username');

function checkLogin() {
    if (currentUser) {
        loginScreen.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => loginScreen.classList.add('hidden'), 500);
        displayUsername.textContent = currentUser;
    } else {
        loginScreen.classList.remove('hidden');
        void loginScreen.offsetWidth; 
        loginScreen.classList.remove('opacity-0', 'pointer-events-none');
    }
}

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = loginInput.value.trim();
    if (name) {
        currentUser = name;
        localStorage.setItem('family_username', currentUser);
        checkLogin();
        showToast(`ยินดีต้อนรับคุณ ${currentUser} 🌷`);
    }
});

window.logout = () => {
    localStorage.removeItem('family_username');
    currentUser = null;
    loginInput.value = '';
    checkLogin();
    document.querySelector('.nav-btn[data-target="view-home"]').click();
};

function showToast(msg) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-msg').textContent = msg;
    toast.classList.replace('toast-hidden', 'toast-active');
    setTimeout(() => toast.classList.replace('toast-active', 'toast-hidden'), 2500);
}

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
        document.getElementById(btn.getAttribute('data-target')).classList.remove('hidden');
        
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.remove('text-peach-400', 'font-medium');
            b.classList.add('text-gray-300');
        });
        btn.classList.remove('text-gray-300');
        btn.classList.add('text-peach-400', 'font-medium');

        if (btn.getAttribute('data-target') === 'view-stats') renderCharts();
    });
});

// ==========================================
// 2. Real-time Database Sync (Firestore)
// ==========================================
onSnapshot(doc(db, "settings", "user_pref"), docSnap => {
    if (docSnap.exists()) BUDGET = docSnap.data().budget || 15000;
    document.getElementById('setting-budget').value = BUDGET;
    document.getElementById('budget-max-label').textContent = BUDGET.toLocaleString();
    updateDashboard();
});

onSnapshot(collection(db, "wallets"), snap => {
    wallets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (wallets.length === 0) seedDefaultData(); 
    renderWalletsUI();
    updateDashboard();
});

onSnapshot(collection(db, "categories"), snap => {
    categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCategoriesUI();
    updateDashboard();
});

onSnapshot(collection(db, "goals"), snap => {
    goals = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderGoals();
});

// ดึงข้อมูลทั้งหมดโดยไม่พึ่ง Composite Index ของ Firebase 
onSnapshot(collection(db, "transactions"), snap => {
    allTx = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateDashboard();
    renderCalendar();
});

async function seedDefaultData() {
    await addDoc(collection(db, "wallets"), { name: "เงินสด" });
    await addDoc(collection(db, "wallets"), { name: "บัญชีธนาคาร" });
    const defaultCats = [
        { name: 'ทั่วไป', emoji: '✨' },
        { name: 'อาหารและเครื่องดื่ม', emoji: '🍜' },
        { name: 'ช้อปปิ้ง', emoji: '🛍️' },
        { name: 'รายรับ', emoji: '💰' }
    ];
    for (let c of defaultCats) await addDoc(collection(db, "categories"), c);
}

// ==========================================
// 3. ภาพรวม, จัดเรียงข้อมูล และ วิเคราะห์ข้อมูล (Dashboard)
// ==========================================
function updateMonthDisplay() {
    const thMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    document.getElementById('month-display').textContent = `${thMonths[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    updateDashboard();
    renderCalendar();
}

document.getElementById('prev-month').onclick = () => { currentDate.setMonth(currentDate.getMonth() - 1); updateMonthDisplay(); };
document.getElementById('next-month').onclick = () => { currentDate.setMonth(currentDate.getMonth() + 1); updateMonthDisplay(); };
document.getElementById('wallet-filter').onchange = (e) => { selectedWalletFilter = e.target.value; updateDashboard(); };

function updateDashboard() {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    
    let filteredTx = allTx.filter(t => {
        const d = new Date(t.date);
        const matchMonth = d.getFullYear() === y && d.getMonth() === m;
        const matchWallet = selectedWalletFilter === 'all' || t.walletId === selectedWalletFilter;
        return matchMonth && matchWallet;
    });

    // 🚨 แกัปัญหาการเรียงลำดับ (Sorting Logic)
    // เรียงตามวันที่ (ใหม่ไปเก่า) และถ้าวันเดียวกันให้เรียงตามเวลาที่กดบันทึก (ใหม่ไปเก่า)
    filteredTx.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateB - dateA; // วันที่ต่างกัน
        return (b.timestamp || 0) - (a.timestamp || 0); // วันเดียวกัน เรียงตามเวลาล่าสุด
    });

    let inc = 0, exp = 0;
    const listEl = document.getElementById('transaction-list');
    listEl.innerHTML = '';
    document.getElementById('tx-count').textContent = `${filteredTx.length} รายการ`;

    if (filteredTx.length === 0) {
        listEl.innerHTML = `<div class="text-center py-10 text-gray-300 text-xs font-medium">ยังไม่มีรายการในเดือนนี้</div>`;
    }

    filteredTx.forEach(t => {
        if (t.type === 'income') inc += t.amount;
        else exp += t.amount;

        const walletObj = wallets.find(w => w.id === t.walletId) || { name: '-' };
        const catObj = categories.find(c => c.id === t.categoryId) || { name: t.categoryName || 'ทั่วไป', emoji: '✨' };
        
        const receiptBadge = t.receiptUrl 
            ? `<button onclick="window.viewReceipt('${t.receiptUrl}')" class="ml-1 text-gray-400 hover:text-peach-400"><i class="fa-solid fa-paperclip text-[10px]"></i></button>` 
            : '';

        const addedByBadge = `<span class="text-peach-400 ml-1.5"><i class="fa-solid fa-user text-[8px]"></i> ${t.addedBy || 'ไม่ระบุ'}</span>`;
        const walletBadge = walletObj.name !== '-' ? `<span class="text-[9px] text-gray-400">-</span>` : '';

        listEl.insertAdjacentHTML('beforeend', `
            <div class="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] mb-3">
                <div class="flex items-center gap-4">
                    <div class="w-11 h-11 rounded-full bg-orange-50 text-orange-400 flex items-center justify-center text-lg">
                        ${catObj.emoji}
                    </div>
                    <div>
                        <div class="flex items-center gap-1.5">
                            <p class="text-[13px] font-semibold text-gray-700">${catObj.name}</p>
                            ${walletBadge}
                        </div>
                        <div class="flex items-center text-[10px] text-gray-400 mt-1 font-light">
                            <span>${formatDate(t.date)}${t.note ? ' • ' + t.note : ''}</span>
                            ${addedByBadge}
                            ${receiptBadge}
                        </div>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1.5">
                    <p class="text-sm font-bold ${t.type === 'income' ? 'text-mint-500' : 'text-gray-700'}">
                        ${t.type === 'income' ? '+' : '-'}฿${t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <div class="flex items-center gap-2.5 text-gray-300">
                        <button onclick="window.editTx('${t.id}')" class="hover:text-gray-500 transition"><i class="fa-solid fa-pen text-[10px]"></i></button>
                        <button onclick="window.delTx('${t.id}')" class="hover:text-peach-400 transition"><i class="fa-solid fa-trash text-[10px]"></i></button>
                    </div>
                </div>
            </div>
        `);
    });

    document.getElementById('total-balance').textContent = `฿${(inc - exp).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById('total-income').textContent = `฿${inc.toLocaleString()}`;
    document.getElementById('total-expense').textContent = `฿${exp.toLocaleString()}`;

    const pct = Math.min((exp / BUDGET) * 100, 100) || 0;
    const bBar = document.getElementById('budget-bar');
    document.getElementById('budget-percent').textContent = `${Math.round(pct)}%`;
    bBar.style.width = `${pct}%`;
    
    if (pct < 60) bBar.className = 'h-2 transition-all duration-700 rounded-full bg-mint-400';
    else if (pct < 85) bBar.className = 'h-2 transition-all duration-700 rounded-full bg-orange-400';
    else bBar.className = 'h-2 transition-all duration-700 rounded-full bg-peach-500';
}

// ==========================================
// 4. บันทึกรายการ & อัปโหลดรูประบบ Base64 Compression
// ==========================================

// ฟังก์ชันบีบอัดรูปภาพด้วย HTML5 Canvas เพื่อลดขนาดไฟล์ก่อนบันทึก
function compressImage(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width, height = img.height;
                if (width > height) {
                    if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
                } else {
                    if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality)); // รีเทิร์นภาพเป็นข้อความ Base64
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}

function setTxType(type) {
    txType = type;
    const btnExp = document.getElementById('btn-tx-expense');
    const btnInc = document.getElementById('btn-tx-income');
    if (type === 'expense') {
        btnExp.className = 'flex-1 py-2.5 text-sm rounded-xl bg-white text-peach-400 shadow-sm font-medium transition';
        btnInc.className = 'flex-1 py-2.5 text-sm rounded-xl text-gray-400 transition';
    } else {
        btnInc.className = 'flex-1 py-2.5 text-sm rounded-xl bg-white text-mint-500 shadow-sm font-medium transition';
        btnExp.className = 'flex-1 py-2.5 text-sm rounded-xl text-gray-400 transition';
    }
}
document.getElementById('btn-tx-expense').onclick = () => setTxType('expense');
document.getElementById('btn-tx-income').onclick = () => setTxType('income');

const receiptInput = document.getElementById('tx-receipt');
receiptInput.onchange = () => {
    document.getElementById('tx-receipt-name').textContent = receiptInput.files[0] ? receiptInput.files[0].name : 'ไม่บังคับ';
};

document.getElementById('form-tx').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-tx');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';

    try {
        const editId = document.getElementById('tx-edit-id').value;
        let fileBase64 = null;

        // บีบอัดรูปลงเหลือความกว้าง 600px และคุณภาพ 70%
        if (receiptInput.files[0]) {
            fileBase64 = await compressImage(receiptInput.files[0], 600, 600, 0.7);
        }

        const catId = document.getElementById('tx-category').value;
        const catObj = categories.find(c => c.id === catId);

        const payload = {
            type: txType,
            amount: parseFloat(document.getElementById('tx-amount').value),
            walletId: document.getElementById('tx-wallet').value,
            categoryId: catId,
            categoryName: catObj ? catObj.name : 'อื่นๆ',
            date: document.getElementById('tx-date').value,
            note: document.getElementById('tx-note').value,
            addedBy: currentUser,
            timestamp: Date.now() // เก็บลำดับเวลาเป็นมิลลิวินาทีเพื่อง่ายต่อการจัดเรียง
        };

        if (fileBase64) payload.receiptUrl = fileBase64; // บันทึกข้อความรูปแทน URL ของ Storage

        if (editId) {
            await updateDoc(doc(db, "transactions", editId), payload);
            showToast("แก้ไขข้อมูลเรียบร้อย");
        } else {
            await addDoc(collection(db, "transactions"), payload);
            showToast("บันทึกข้อมูลเรียบร้อย");
        }
        
        closeAppModal('modal-add-tx'); // ปิดหน้าต่างให้เรียบร้อย
    } catch (err) {
        showToast("เกิดข้อผิดพลาดลองใหม่อีกครั้ง", true);
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.textContent = 'บันทึกข้อมูล';
    }
});

window.editTx = (id) => {
    const tx = allTx.find(t => t.id === id);
    if (!tx) return;
    document.getElementById('tx-edit-id').value = tx.id;
    document.getElementById('modal-tx-title').textContent = 'แก้ไขรายการ';
    setTxType(tx.type);
    document.getElementById('tx-amount').value = tx.amount;
    document.getElementById('tx-wallet').value = tx.walletId;
    document.getElementById('tx-category').value = tx.categoryId;
    document.getElementById('tx-date').value = tx.date;
    document.getElementById('tx-note').value = tx.note || '';
    document.getElementById('tx-receipt-name').textContent = tx.receiptUrl ? 'มีรูปเดิมอยู่แล้ว' : 'ไม่บังคับ';
    
    openAppModal('modal-add-tx');
};

window.delTx = async (id) => {
    if (confirm("ต้องการลบรายการนี้ใช่ไหมคะ?")) {
        await deleteDoc(doc(db, "transactions", id));
        showToast("ลบรายการแล้ว");
    }
};

window.viewReceipt = (url) => {
    document.getElementById('receipt-full-img').src = url;
    document.getElementById('modal-receipt').classList.remove('hidden');
};

// ==========================================
// 5. จัดการ Multi-Wallet & Custom Categories
// ==========================================
function renderWalletsUI() {
    const sel = document.getElementById('tx-wallet');
    const filter = document.getElementById('wallet-filter');
    const manageList = document.getElementById('wallets-list-manage');
    
    sel.innerHTML = '';
    filter.innerHTML = '<option value="all">กระเป๋าเงินทั้งหมด</option>';
    manageList.innerHTML = '';

    wallets.forEach(w => {
        const opt = `<option value="${w.id}">${w.name}</option>`;
        sel.insertAdjacentHTML('beforeend', opt);
        filter.insertAdjacentHTML('beforeend', opt);
        manageList.insertAdjacentHTML('beforeend', `
            <div class="flex justify-between items-center bg-gray-50 px-4 py-3 rounded-2xl">
                <span class="text-sm">${w.name}</span>
                <button onclick="window.delWallet('${w.id}')" class="text-gray-300 hover:text-peach-400"><i class="fa-solid fa-trash text-sm"></i></button>
            </div>
        `);
    });
    filter.value = selectedWalletFilter;
}

function renderCategoriesUI() {
    const sel = document.getElementById('tx-category');
    const manageList = document.getElementById('categories-list-manage');
    sel.innerHTML = ''; manageList.innerHTML = '';

    categories.forEach(c => {
        sel.insertAdjacentHTML('beforeend', `<option value="${c.id}">${c.emoji} ${c.name}</option>`);
        manageList.insertAdjacentHTML('beforeend', `
            <div class="flex justify-between items-center bg-gray-50 px-4 py-3 rounded-2xl">
                <span class="text-sm">${c.emoji} ${c.name}</span>
                <button onclick="window.delCat('${c.id}')" class="text-gray-300 hover:text-peach-400"><i class="fa-solid fa-trash text-sm"></i></button>
            </div>
        `);
    });
}

document.getElementById('form-wallet').onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('wallet-name');
    await addDoc(collection(db, "wallets"), { name: input.value });
    input.value = ''; showToast("เพิ่มกระเป๋าเงินแล้ว");
};
window.delWallet = async (id) => { if (confirm("ลบกระเป๋าเงินใบนี้?")) await deleteDoc(doc(db, "wallets", id)); };

document.getElementById('form-category').onsubmit = async (e) => {
    e.preventDefault();
    const emoji = document.getElementById('cat-emoji');
    const name = document.getElementById('cat-name');
    await addDoc(collection(db, "categories"), { emoji: emoji.value, name: name.value });
    emoji.value = ''; name.value = ''; showToast("เพิ่มหมวดหมู่แล้ว");
};
window.delCat = async (id) => { if (confirm("ลบหมวดหมู่นี้?")) await deleteDoc(doc(db, "categories", id)); };

// ==========================================
// 6. กระปุกออมเงิน (Savings Goals)
// ==========================================
document.getElementById('form-goal').onsubmit = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "goals"), {
        name: document.getElementById('goal-name').value,
        target: parseFloat(document.getElementById('goal-target').value),
        current: parseFloat(document.getElementById('goal-current').value) || 0
    });
    document.getElementById('form-goal').reset();
    closeAppModal('modal-goal');
    showToast("สร้างเป้าหมายเรียบร้อย");
};

function renderGoals() {
    const list = document.getElementById('goals-list');
    list.innerHTML = goals.length === 0 ? `<p class="text-center text-gray-400 font-light text-sm py-10">ยังไม่มีเป้าหมายการเก็บเงินค่ะ</p>` : '';
    
    goals.forEach(g => {
        const pct = Math.min(Math.round((g.current / g.target) * 100), 100);
        list.insertAdjacentHTML('beforeend', `
            <div class="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm mb-4">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h3 class="font-semibold text-sm text-gray-800">${g.name}</h3>
                        <p class="text-xs text-gray-400 font-light mt-0.5">เก็บได้ ฿${g.current.toLocaleString()} / ฿${g.target.toLocaleString()}</p>
                    </div>
                    <button onclick="window.addGoalAmt('${g.id}', ${g.current})" class="bg-gray-50 text-gray-600 text-[10px] font-medium px-3 py-1.5 rounded-full hover:bg-peach-50 hover:text-peach-500 transition">+ ออมเพิ่ม</button>
                </div>
                <div class="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden mb-3">
                    <div class="h-2.5 bg-peach-400 transition-all duration-700" style="width: ${pct}%"></div>
                </div>
                <div class="flex justify-between items-center text-xs">
                    <span class="text-peach-500 font-medium">สำเร็จแล้ว ${pct}%</span>
                    <button onclick="window.delGoal('${g.id}')" class="text-gray-300 hover:text-red-400 transition">ลบ</button>
                </div>
            </div>
        `);
    });
}
window.addGoalAmt = async (id, current) => {
    const add = prompt("ระบุจำนวนเงินที่ต้องการเก็บเพิ่ม (บาท):");
    if (add && !isNaN(add)) {
        await updateDoc(doc(db, "goals", id), { current: current + parseFloat(add) });
        showToast("บันทึกยอดเก็บเงินเพิ่มแล้ว 👏");
    }
};
window.delGoal = async (id) => { if (confirm("ต้องการลบเป้าหมายนี้?")) await deleteDoc(doc(db, "goals", id)); };

// ==========================================
// 7. Calendar & Analytics (ปฏิทิน และ กราฟ)
// ==========================================
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    const y = currentDate.getFullYear(), m = currentDate.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const dailyExp = {};
    allTx.forEach(t => {
        const d = new Date(t.date);
        if (d.getFullYear() === y && d.getMonth() === m && t.type === 'expense') {
            dailyExp[d.getDate()] = (dailyExp[d.getDate()] || 0) + t.amount;
        }
    });

    for (let i = 0; i < firstDay; i++) grid.insertAdjacentHTML('beforeend', '<div></div>');
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = day === new Date().getDate() && m === new Date().getMonth() && y === new Date().getFullYear();
        const expText = dailyExp[day] ? `<span class="text-[9px] text-peach-500 font-medium leading-tight mt-1">-${dailyExp[day].toLocaleString()}</span>` : '';
        const todayStyle = isToday ? 'bg-peach-50 text-peach-500 border border-peach-100' : 'bg-gray-50 border border-transparent text-gray-700';
        
        grid.insertAdjacentHTML('beforeend', `
            <div class="h-14 rounded-2xl flex flex-col items-center justify-start pt-2 px-0.5 ${todayStyle}">
                <span class="text-xs font-light">${day}</span>
                ${expText}
            </div>
        `);
    }
}

function renderCharts() {
    const textColor = '#9ca3af'; 
    const pastelPalette = ['#fda4af', '#fcd34d', '#cbd5e1', '#c4b5fd', '#99f6e4', '#fbcfe8'];

    const y = currentDate.getFullYear(), m = currentDate.getMonth();
    const curMonthExp = allTx.filter(t => new Date(t.date).getFullYear() === y && new Date(t.date).getMonth() === m && t.type === 'expense');

    const catMap = {};
    curMonthExp.forEach(t => {
        const cName = categories.find(c => c.id === t.categoryId)?.name || t.categoryName || 'อื่นๆ';
        catMap[cName] = (catMap[cName] || 0) + t.amount;
    });

    if (pieChartInst) pieChartInst.destroy();
    pieChartInst = new Chart(document.getElementById('pieChart'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(catMap),
            datasets: [{ data: Object.values(catMap), backgroundColor: pastelPalette, borderWidth: 0, hoverOffset: 4 }]
        },
        options: { maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { color: textColor, usePointStyle: true, padding: 20, font: { family: 'Kanit', size: 11, weight: '300' } } } } }
    });

    const labels = [], incArr = [], expArr = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(y, m - i, 1);
        labels.push(d.toLocaleDateString('th-TH', { month: 'short' }));
        const mTx = allTx.filter(t => new Date(t.date).getFullYear() === d.getFullYear() && new Date(t.date).getMonth() === d.getMonth());
        incArr.push(mTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0));
        expArr.push(mTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
    }

    if (barChartInst) barChartInst.destroy();
    barChartInst = new Chart(document.getElementById('barChart'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'รายรับ', data: incArr, backgroundColor: '#a7f3d0', borderRadius: 8 },
                { label: 'รายจ่าย', data: expArr, backgroundColor: '#fecdd3', borderRadius: 8 }
            ]
        },
        options: { maintainAspectRatio: false, scales: { x: { ticks: { color: textColor, font:{family:'Kanit'} }, grid:{display:false} }, y: { ticks: { color: textColor, font:{family:'Kanit'} }, border:{dash:[4,4]} } }, plugins: { legend: { labels: { color: textColor, font: { family: 'Kanit' }, usePointStyle: true } } } }
    });
}

document.getElementById('save-budget').onclick = async () => {
    const val = parseFloat(document.getElementById('setting-budget').value);
    if (val > 0) {
        await setDoc(doc(db, "settings", "user_pref"), { budget: val }, { merge: true });
        showToast("บันทึกงบประมาณแล้ว");
    }
};

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

// เริ่มโปรแกรม
checkLogin();
updateMonthDisplay();