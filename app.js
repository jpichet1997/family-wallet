import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, setDoc, query, orderBy, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

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
const storage = getStorage(app);

// State Variables (เก็บข้อมูลในหน่วยความจำเพื่อประมวลผล)
let allTx = [], wallets = [], categories = [], goals = [];
let currentDate = new Date();
let BUDGET = 15000;
let selectedWalletFilter = "all";
let txType = 'expense';
let pieChartInst = null, barChartInst = null;

// ==========================================
// 1. UI UX & Navigation (จัดการหน้าจอและโหมดกลางคืน)
// ==========================================
const darkToggle = document.getElementById('dark-toggle');
darkToggle.addEventListener('change', (e) => {
    const isDark = e.target.checked;
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    if (pieChartInst || barChartInst) renderCharts(); // วาดกราฟใหม่เพื่อเปลี่ยนสีตัวหนังสือ
});

if (localStorage.getItem('theme') === 'dark') {
    darkToggle.checked = true;
    document.documentElement.classList.add('dark');
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-msg').textContent = msg;
    toast.classList.replace('toast-hidden', 'toast-active');
    setTimeout(() => toast.classList.replace('toast-active', 'toast-hidden'), 2500);
}

// ระบบ Navigation สลับหน้าจอ
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
        document.getElementById(btn.getAttribute('data-target')).classList.remove('hidden');
        
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.remove('text-blush-400', 'font-medium');
            b.classList.add('text-stone-400');
        });
        btn.classList.remove('text-stone-400');
        btn.classList.add('text-blush-400', 'font-medium');

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
    if (wallets.length === 0) seedDefaultData(); // สร้างข้อมูลเริ่มต้นถ้ายังไม่มี
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

onSnapshot(query(collection(db, "transactions"), orderBy("date", "desc")), snap => {
    allTx = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateDashboard();
    renderCalendar();
});

// สร้างข้อมูลพื้นฐานอัตโนมัติให้แอปพร้อมใช้
async function seedDefaultData() {
    await addDoc(collection(db, "wallets"), { name: "เงินสด" });
    await addDoc(collection(db, "wallets"), { name: "บัญชีธนาคาร" });
    const defaultCats = [
        { name: 'อาหารและของว่าง', emoji: '🥗' },
        { name: 'เดินทาง', emoji: '🚕' },
        { name: 'ช้อปปิ้ง', emoji: '🛍️' },
        { name: 'ความสวยความงาม', emoji: '💅' },
        { name: 'รายรับ/เงินเดือน', emoji: '💰' }
    ];
    for (let c of defaultCats) await addDoc(collection(db, "categories"), c);
}

// ==========================================
// 3. ภาพรวม และ วิเคราะห์ข้อมูล (Dashboard & Insights)
// ==========================================
function updateMonthDisplay() {
    const thMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
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
    
    // กรองข้อมูลตามเดือนและกระเป๋าเงิน
    const filteredTx = allTx.filter(t => {
        const d = new Date(t.date);
        const matchMonth = d.getFullYear() === y && d.getMonth() === m;
        const matchWallet = selectedWalletFilter === 'all' || t.walletId === selectedWalletFilter;
        return matchMonth && matchWallet;
    });

    let inc = 0, exp = 0;
    const listEl = document.getElementById('transaction-list');
    listEl.innerHTML = '';
    document.getElementById('tx-count').textContent = `${filteredTx.length} รายการ`;

    if (filteredTx.length === 0) {
        listEl.innerHTML = `<p class="text-center py-8 text-stone-400 text-sm font-light">ยังไม่มีรายการค่าใช้จ่ายในเดือนนี้ค่ะ</p>`;
    }

    filteredTx.forEach(t => {
        if (t.type === 'income') inc += t.amount;
        else exp += t.amount;

        const walletObj = wallets.find(w => w.id === t.walletId) || { name: '-' };
        const catObj = categories.find(c => c.id === t.categoryId) || { name: t.categoryName || 'ทั่วไป', emoji: '✨' };
        
        // ปุ่มดูรูปสลิป
        const receiptBadge = t.receiptUrl 
            ? `<button onclick="window.viewReceipt('${t.receiptUrl}')" class="ml-2 text-[10px] text-stone-400 hover:text-blush-400 transition"><i class="fa-solid fa-paperclip"></i> สลิป</button>` 
            : '';

        listEl.insertAdjacentHTML('beforeend', `
            <div class="flex justify-between items-center bg-white dark:bg-stone-800 p-4 rounded-2xl border border-stone-100 dark:border-stone-700/50 mb-3 shadow-sm">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-full bg-stone-50 dark:bg-stone-700 flex items-center justify-center text-lg">${catObj.emoji}</div>
                    <div>
                        <div class="flex items-center gap-2">
                            <p class="text-sm font-medium">${catObj.name}</p>
                            <span class="text-[9px] bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-300 px-2 py-0.5 rounded-full">${walletObj.name}</span>
                        </div>
                        <p class="text-[11px] text-stone-400 font-light mt-0.5">${formatDate(t.date)} ${t.note ? '• ' + t.note : ''} ${receiptBadge}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-medium text-sm ${t.type === 'income' ? 'text-emerald-500' : 'text-stone-700 dark:text-stone-200'}">
                        ${t.type === 'income' ? '+' : '-'}฿${t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <div class="flex justify-end gap-3 mt-1.5 text-xs text-stone-300 dark:text-stone-500">
                        <button onclick="window.editTx('${t.id}')" class="hover:text-stone-500 dark:hover:text-stone-300 transition"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="window.delTx('${t.id}')" class="hover:text-blush-400 transition"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            </div>
        `);
    });

    document.getElementById('total-balance').textContent = `฿${(inc - exp).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById('total-income').textContent = `฿${inc.toLocaleString()}`;
    document.getElementById('total-expense').textContent = `฿${exp.toLocaleString()}`;

    // คำนวณแถบ Budget 
    const pct = Math.min((exp / BUDGET) * 100, 100) || 0;
    const bBar = document.getElementById('budget-bar');
    document.getElementById('budget-percent').textContent = `${Math.round(pct)}%`;
    bBar.style.width = `${pct}%`;
    
    // เปลี่ยนสีแถบตามความเหมาะสม
    if (pct < 60) bBar.className = 'h-2 transition-all duration-700 rounded-full bg-emerald-400';
    else if (pct < 85) bBar.className = 'h-2 transition-all duration-700 rounded-full bg-amber-400';
    else bBar.className = 'h-2 transition-all duration-700 rounded-full bg-blush-500';

    if (pct >= 85) document.getElementById('alert-banner').classList.remove('hidden');
    else document.getElementById('alert-banner').classList.add('hidden');

    generateSmartInsights(filteredTx, exp);
}

// ระบบวิเคราะห์ข้อความอัตโนมัติแบบนุ่มนวล
function generateSmartInsights(txList, totalExp) {
    const insightEl = document.getElementById('smart-insight');
    const expenses = txList.filter(t => t.type === 'expense');
    if (expenses.length === 0) {
        insightEl.textContent = "ยังไม่มีข้อมูลรายจ่ายค่ะ เริ่มบันทึกเพื่อให้ระบบช่วยสรุปข้อมูลให้นะคะ";
        return;
    }

    const catTotals = {};
    expenses.forEach(t => { catTotals[t.categoryId] = (catTotals[t.categoryId] || 0) + t.amount; });
    const topCatId = Object.keys(catTotals).reduce((a, b) => catTotals[a] > catTotals[b] ? a : b);
    const topCatObj = categories.find(c => c.id === topCatId) || { name: 'อื่นๆ' };
    const topPercent = Math.round((catTotals[topCatId] / totalExp) * 100);

    insightEl.innerHTML = `เดือนนี้ยอดใช้จ่ายส่วนใหญ่ไปกับหมวด <b>"${topCatObj.name}"</b> คิดเป็น <b>${topPercent}%</b> ของรายจ่ายทั้งหมด (฿${catTotals[topCatId].toLocaleString()}) ลองดูงบในส่วนนี้นะคะ`;
}

// ==========================================
// 4. บันทึกรายการ และ อัปโหลดรูป (Firebase Storage)
// ==========================================
function setTxType(type) {
    txType = type;
    const btnExp = document.getElementById('btn-tx-expense');
    const btnInc = document.getElementById('btn-tx-income');
    if (type === 'expense') {
        btnExp.className = 'flex-1 py-2.5 text-sm rounded-xl bg-white dark:bg-stone-700 text-blush-500 shadow-sm font-medium transition';
        btnInc.className = 'flex-1 py-2.5 text-sm rounded-xl text-stone-400 font-light transition';
    } else {
        btnInc.className = 'flex-1 py-2.5 text-sm rounded-xl bg-white dark:bg-stone-700 text-emerald-500 shadow-sm font-medium transition';
        btnExp.className = 'flex-1 py-2.5 text-sm rounded-xl text-stone-400 font-light transition';
    }
}
document.getElementById('btn-tx-expense').onclick = () => setTxType('expense');
document.getElementById('btn-tx-income').onclick = () => setTxType('income');

document.getElementById('fab-add-tx').onclick = () => {
    document.getElementById('form-tx').reset();
    document.getElementById('tx-edit-id').value = '';
    document.getElementById('modal-tx-title').textContent = 'บันทึกรายการ';
    document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('tx-receipt-name').textContent = 'ไม่บังคับ';
    setTxType('expense');
    document.getElementById('modal-add-tx').classList.remove('hidden');
};

const receiptInput = document.getElementById('tx-receipt');
receiptInput.onchange = () => {
    document.getElementById('tx-receipt-name').textContent = receiptInput.files[0] ? receiptInput.files[0].name : 'ไม่บังคับ';
};

document.getElementById('form-tx').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-tx');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';

    try {
        const editId = document.getElementById('tx-edit-id').value;
        let fileUrl = null;

        // ฟังก์ชันอัปโหลดรูป
        if (receiptInput.files[0]) {
            const file = receiptInput.files[0];
            const storageRef = ref(storage, `receipts/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            fileUrl = await getDownloadURL(storageRef);
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
            timestamp: new Date()
        };
        if (fileUrl) payload.receiptUrl = fileUrl;

        if (editId) {
            await updateDoc(doc(db, "transactions", editId), payload);
            showToast("แก้ไขข้อมูลเรียบร้อย");
        } else {
            await addDoc(collection(db, "transactions"), payload);
            showToast("บันทึกข้อมูลเรียบร้อย");
        }
        document.getElementById('modal-add-tx').classList.add('hidden');
    } catch (err) {
        alert("เกิดข้อผิดพลาด: " + err.message);
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
    document.getElementById('tx-receipt-name').textContent = tx.receiptUrl ? 'มีรูปเดิมอยู่แล้ว (เลือกเพื่อเปลี่ยน)' : 'ไม่บังคับ';
    document.getElementById('modal-add-tx').classList.remove('hidden');
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
            <div class="flex justify-between items-center bg-stone-50 dark:bg-stone-800 p-4 rounded-2xl">
                <span>${w.name}</span>
                <button onclick="window.delWallet('${w.id}')" class="text-stone-400 hover:text-blush-400 transition"><i class="fa-solid fa-trash"></i></button>
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
            <div class="flex justify-between items-center bg-stone-50 dark:bg-stone-800 p-4 rounded-2xl">
                <span>${c.emoji} ${c.name}</span>
                <button onclick="window.delCat('${c.id}')" class="text-stone-400 hover:text-blush-400 transition"><i class="fa-solid fa-trash"></i></button>
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
    document.getElementById('modal-goal').classList.add('hidden');
    showToast("สร้างเป้าหมายเรียบร้อย");
};

function renderGoals() {
    const list = document.getElementById('goals-list');
    list.innerHTML = goals.length === 0 ? `<p class="text-center text-stone-400 font-light text-sm py-10">ยังไม่มีเป้าหมายการเก็บเงินค่ะ</p>` : '';
    
    goals.forEach(g => {
        const pct = Math.min(Math.round((g.current / g.target) * 100), 100);
        list.insertAdjacentHTML('beforeend', `
            <div class="bg-white dark:bg-stone-800 p-5 rounded-[2rem] border border-stone-100 dark:border-stone-700/50">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h3 class="font-medium text-base">${g.name}</h3>
                        <p class="text-xs text-stone-400 font-light mt-0.5">เก็บได้ ฿${g.current.toLocaleString()} / ฿${g.target.toLocaleString()}</p>
                    </div>
                    <button onclick="window.addGoalAmt('${g.id}', ${g.current})" class="bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-200 text-[10px] font-medium px-3 py-1.5 rounded-full hover:bg-blush-50 hover:text-blush-500 transition">+ ออมเพิ่ม</button>
                </div>
                <div class="w-full bg-stone-100 dark:bg-stone-700 h-2.5 rounded-full overflow-hidden mb-3">
                    <div class="h-2.5 bg-gradient-to-r from-blush-300 to-rose-400 transition-all duration-700" style="width: ${pct}%"></div>
                </div>
                <div class="flex justify-between items-center text-xs font-light">
                    <span class="text-blush-500 font-medium">สำเร็จแล้ว ${pct}%</span>
                    <button onclick="window.delGoal('${g.id}')" class="text-stone-300 hover:text-rose-400 transition">ยกเลิกเป้าหมาย</button>
                </div>
            </div>
        `);
    });
}
window.addGoalAmt = async (id, current) => {
    const add = prompt("ระบุจำนวนเงินที่ต้องการเก็บเพิ่ม (บาท):");
    if (add && !isNaN(add)) {
        await updateDoc(doc(db, "goals", id), { current: current + parseFloat(add) });
        showToast("บันทึกยอดเก็บเงินเพิ่มแล้วเก่งมากค่ะ 👏");
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
        const expText = dailyExp[day] ? `<span class="text-[9px] text-blush-500 font-medium leading-tight mt-1">-${dailyExp[day].toLocaleString()}</span>` : '';
        const todayStyle = isToday ? 'bg-blush-50 dark:bg-stone-700 text-blush-500 border-blush-100 dark:border-stone-600' : 'bg-white dark:bg-stone-900 border-stone-50 dark:border-stone-800';
        
        grid.insertAdjacentHTML('beforeend', `
            <div class="h-14 rounded-2xl border flex flex-col items-center justify-start pt-2 px-0.5 ${todayStyle}">
                <span class="text-xs font-light">${day}</span>
                ${expText}
            </div>
        `);
    }
}

function renderCharts() {
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#a8a29e' : '#78716c'; 
    const pastelPalette = ['#fda4af', '#fcd34d', '#cbd5e1', '#c4b5fd', '#99f6e4', '#fbcfe8'];

    const y = currentDate.getFullYear(), m = currentDate.getMonth();
    const curMonthExp = allTx.filter(t => new Date(t.date).getFullYear() === y && new Date(t.date).getMonth() === m && t.type === 'expense');

    // Doughnut Chart
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

    // Bar Chart
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
        options: { maintainAspectRatio: false, scales: { x: { ticks: { color: textColor, font:{family:'Kanit', weight:'300'} }, grid:{display:false} }, y: { ticks: { color: textColor, font:{family:'Kanit', weight:'300'} }, border:{dash:[4,4]} } }, plugins: { legend: { labels: { color: textColor, font: { family: 'Kanit', weight: '300' }, usePointStyle: true } } } }
    });
}

// ==========================================
// 8. Service Worker & ตั้งค่า
// ==========================================
document.getElementById('save-budget').onclick = async () => {
    const val = parseFloat(document.getElementById('setting-budget').value);
    if (val > 0) {
        await setDoc(doc(db, "settings", "user_pref"), { budget: val }, { merge: true });
        showToast("บันทึกงบประมาณแล้ว");
    }
};

// ลงทะเบียน Push Notification
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js');
}

document.getElementById('enable-push').onclick = async () => {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
        showToast("เปิดรับการแจ้งเตือนเรียบร้อย");
        new Notification("My Expense Tracker", { body: "พร้อมแจ้งเตือนให้บันทึกบัญชีทุกวันแล้วค่ะ 🌷" });
    } else {
        alert("คุณบล็อกการแจ้งเตือนไว้ในเบราว์เซอร์ค่ะ");
    }
};

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

// เริ่มต้นโปรแกรม
updateMonthDisplay();