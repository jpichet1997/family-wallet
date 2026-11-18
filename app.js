// อิมพอร์ต Firebase SDK (V9 Modular) จาก CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, setDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDOwbbJyTjElBbRD--ZJoxBYFUFXEs6ahs",
  authDomain: "expense-tracker-dd89a.firebaseapp.com",
  projectId: "expense-tracker-dd89a",
  storageBucket: "expense-tracker-dd89a.firebasestorage.app",
  messagingSenderId: "702104768572",
  appId: "1:702104768572:web:bc092ce6a43c79c7d5b339"
};

// เริ่มต้นใช้งาน Firebase และ Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const txCollection = collection(db, "transactions");
const configDoc = doc(db, "settings", "family_config"); 

// ดึง DOM Elements
const listEl = document.getElementById("transaction-list");
const balanceEl = document.getElementById("total-balance");
const incomeEl = document.getElementById("total-income");
const expenseEl = document.getElementById("total-expense");
const form = document.getElementById("add-form");
const dateInput = document.getElementById("tx-date");
const toast = document.getElementById("toast");

// ตัวแปรระบบเลือกเดือน
let currentDate = new Date();
const monthDisplay = document.getElementById("current-month-display");
const statsMonthLabel = document.getElementById("stats-month-label");

dateInput.value = new Date().toISOString().split('T')[0];
let allTransactions = []; 
let currentMonthTransactions = []; 
let chartInstance = null;
let MONTHLY_BUDGET = 15000; 

// ==========================================
// Toast & Navigation (ฟังก์ชันแจ้งเตือนและเปลี่ยนหน้า)
// ==========================================
function showToast(message, isError = false) {
    document.getElementById("toast-msg").textContent = message;
    toast.querySelector('i').className = isError ? "fa-solid fa-circle-exclamation text-peach-500" : "fa-solid fa-circle-check text-mint-500";
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-active');
    setTimeout(() => {
        toast.classList.remove('toast-active');
        toast.classList.add('toast-enter');
    }, 2500);
}

function switchView(targetId) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));
    document.getElementById(targetId).classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(b => {
        if(b.getAttribute('data-target') === targetId) {
            b.classList.replace('text-gray-400', 'text-peach-500');
            b.querySelector('.nav-indicator').classList.replace('scale-0', 'scale-100');
            b.querySelector('.nav-indicator').classList.replace('bg-gray-100', 'bg-peach-50');
        } else {
            b.classList.replace('text-peach-500', 'text-gray-400');
            b.querySelector('.nav-indicator').classList.replace('scale-100', 'scale-0');
            b.querySelector('.nav-indicator').classList.replace('bg-peach-50', 'bg-gray-100');
        }
    });
    if(targetId === 'view-stats') renderChart();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.getAttribute('data-target')));
});
document.querySelectorAll('.nav-btn-link').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.getAttribute('data-target')));
});

// UI สำหรับสลับฟอร์มเพิ่มข้อมูล (รายจ่าย / รายรับ)
const btnExpense = document.getElementById('btn-type-expense');
const btnIncome = document.getElementById('btn-type-income');
const typeInput = document.getElementById('tx-type');
const toggleBg = document.getElementById('toggle-bg');

btnExpense.addEventListener('click', () => {
    typeInput.value = 'expense';
    toggleBg.style.transform = 'translateX(0)';
    btnExpense.classList.replace('text-gray-400', 'text-peach-500');
    btnIncome.classList.replace('text-mint-600', 'text-gray-400');
});
btnIncome.addEventListener('click', () => {
    typeInput.value = 'income';
    toggleBg.style.transform = 'translateX(100%)';
    btnIncome.classList.replace('text-gray-400', 'text-mint-600');
    btnExpense.classList.replace('text-peach-500', 'text-gray-400');
});

// ==========================================
// Firestore: ดึงตั้งค่างบประมาณ
// ==========================================
onSnapshot(configDoc, (docSnap) => {
    if (docSnap.exists()) {
        MONTHLY_BUDGET = docSnap.data().budget || 15000;
    } else {
        setDoc(configDoc, { budget: 15000 });
    }
    document.getElementById("setting-budget").value = MONTHLY_BUDGET;
    document.getElementById("budget-label").textContent = `งบประมาณรายจ่าย (${MONTHLY_BUDGET.toLocaleString()} ฿)`;
    filterAndRenderData(); 
});

document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newBudget = parseFloat(document.getElementById("setting-budget").value);
    await setDoc(configDoc, { budget: newBudget }, { merge: true });
    showToast("อัปเดตงบประมาณแล้ว");
    switchView('view-home');
});

// ==========================================
// ระบบเลือกเดือน (Month Filter)
// ==========================================
function updateMonthDisplay() {
    const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const monthText = `${thaiMonths[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    monthDisplay.textContent = monthText;
    statsMonthLabel.textContent = `ประจำเดือน: ${monthText}`;
    filterAndRenderData();
}

document.getElementById("prev-month").addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    updateMonthDisplay();
});
document.getElementById("next-month").addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    updateMonthDisplay();
});

// ==========================================
// การบันทึกและดึงข้อมูลจาก Firestore (CRUD)
// ==========================================

// 1. เพิ่มข้อมูล (Create)
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
    submitBtn.disabled = true;

    try {
        await addDoc(txCollection, {
            type: typeInput.value,
            member: document.getElementById("tx-member").value,
            amount: parseFloat(document.getElementById("tx-amount").value),
            category: document.getElementById("tx-category").value,
            date: document.getElementById("tx-date").value,
            note: document.getElementById("tx-note").value,
            timestamp: new Date()
        });
        
        const lastMember = document.getElementById("tx-member").value;
        form.reset();
        document.getElementById("tx-member").value = lastMember; 
        dateInput.value = new Date().toISOString().split('T')[0];
        
        showToast("บันทึกรายการเรียบร้อยแล้ว ✨");
        currentDate = new Date(); 
        updateMonthDisplay();
        switchView('view-home'); 
    } catch (error) {
        showToast("เกิดข้อผิดพลาดในการบันทึก", true);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
});

// 2. อ่านข้อมูล Real-time (Read)
const q = query(txCollection, orderBy("date", "desc"));
onSnapshot(q, (snapshot) => {
    allTransactions = [];
    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        data.id = docSnap.id;
        allTransactions.push(data);
    });
    updateMonthDisplay();
});

// คำนวณและแสดงผลรายการของเดือนที่เลือก
function filterAndRenderData() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    currentMonthTransactions = allTransactions.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate.getFullYear() === year && txDate.getMonth() === month;
    });

    let totalIncome = 0;
    let totalExpense = 0;
    listEl.innerHTML = "";

    if (currentMonthTransactions.length === 0) {
        listEl.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 text-gray-300">
                <i class="fa-solid fa-box-open text-4xl mb-3 opacity-50"></i>
                <p class="text-sm font-light">ไม่มีรายการในเดือนนี้</p>
            </div>`;
    }

    currentMonthTransactions.forEach((data) => {
        if (data.type === "income") totalIncome += data.amount;
        else totalExpense += data.amount;

        const isExpense = data.type === "expense";
        const iconBg = isExpense ? "bg-peach-50 text-peach-500" : "bg-mint-50 text-mint-500";
        const amountColor = isExpense ? "text-gray-700" : "text-mint-600";
        const sign = isExpense ? "-" : "+";
        const memberBadge = data.member ? `<span class="bg-gray-100 text-gray-500 text-[9px] px-1.5 py-0.5 rounded-md ml-1">${data.member}</span>` : '';

        const itemHTML = `
            <div class="group flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-50 shadow-[0_2px_10px_rgba(0,0,0,0.01)] mb-3">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-full ${iconBg} flex items-center justify-center text-xl">
                        ${data.category.includes('อาหาร') ? '🍜' : data.category.includes('ช้อป') ? '🛍️' : data.category.includes('เดินทาง') ? '🚝' : data.category.includes('บ้าน') ? '🏠' : data.category.includes('เงิน') ? '💰' : '✨'}
                    </div>
                    <div>
                        <p class="text-sm font-medium text-gray-700">${data.category} ${memberBadge}</p>
                        <p class="text-[11px] font-light text-gray-400 mt-0.5">${formatDate(data.date)} ${data.note ? `• ${data.note}` : ''}</p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <p class="text-sm font-semibold ${amountColor}">${sign}฿${data.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                    <button onclick="window.deleteTx('${data.id}')" class="w-8 h-8 rounded-full bg-gray-50 text-gray-300 hover:text-peach-500 hover:bg-peach-50 transition-colors flex items-center justify-center">
                        <i class="fa-solid fa-xmark text-xs"></i>
                    </button>
                </div>
            </div>
        `;
        listEl.insertAdjacentHTML('beforeend', itemHTML);
    });

    // อัปเดตตัวเลขหน้า Dashboard
    const balance = totalIncome - totalExpense;
    balanceEl.textContent = `฿${balance.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    incomeEl.textContent = `฿${totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    expenseEl.textContent = `฿${totalExpense.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

    updateBudgetBar(totalExpense);
    if(!document.getElementById('view-stats').classList.contains('hidden')) renderChart();
}

function updateBudgetBar(expense) {
    const budgetBar = document.getElementById("budget-bar");
    const budgetText = document.getElementById("budget-text");
    
    let percent = (expense / MONTHLY_BUDGET) * 100;
    if (percent > 100) percent = 100;
    
    budgetBar.style.width = `${percent}%`;
    budgetText.textContent = `${Math.round(percent)}%`;

    if (percent < 50) budgetBar.className = "h-3.5 rounded-full transition-all duration-700 ease-out bg-mint-400";
    else if (percent < 85) budgetBar.className = "h-3.5 rounded-full transition-all duration-700 ease-out bg-orange-400";
    else budgetBar.className = "h-3.5 rounded-full transition-all duration-700 ease-out bg-peach-500";
}

// 3. ลบข้อมูล (Delete)
window.deleteTx = async (id) => {
    if (confirm("ต้องการลบรายการนี้ใช่ไหมคะ?")) {
        await deleteDoc(doc(db, "transactions", id));
        showToast("ลบรายการแล้ว");
    }
};

// ==========================================
// Chart.js (สร้างกราฟวงกลม)
// ==========================================
function renderChart() {
    const expenses = currentMonthTransactions.filter(t => t.type === 'expense');
    const grouped = expenses.reduce((acc, curr) => {
        acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
        return acc;
    }, {});

    const labels = Object.keys(grouped);
    const data = Object.values(grouped);
    const ctx = document.getElementById('expenseChart').getContext('2d');
    
    if (chartInstance) chartInstance.destroy();

    if(data.length === 0) {
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['ไม่มีข้อมูล'], datasets: [{ data: [1], backgroundColor: ['#F3F0EC'], borderWidth: 0 }] },
            options: { cutout: '75%', plugins: { tooltip: { enabled: false }, legend: { display: false } } }
        });
        return;
    }

    const pastelColors = ['#fca5a5', '#fcd34d', '#86efac', '#93c5fd', '#c4b5fd', '#f9a8d4'];

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{ data: data, backgroundColor: pastelColors, borderWidth: 3, borderColor: '#ffffff', hoverOffset: 6 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, padding: 25, font: { family: 'Kanit', size: 12 }, color: '#9ca3af' } },
                tooltip: { backgroundColor: '#374151', padding: 12, cornerRadius: 12, titleFont: { family: 'Kanit' }, bodyFont: { family: 'Kanit' } }
            }
        }
    });
}

// แปลงรูปแบบวันที่
function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}