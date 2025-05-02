import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create server instance
const server = new McpServer({
    name: "ximply",
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {},
    },
});

// Mock database to simulate data storage
const mockDB = {
    transactions: [
        {
            id: "tx-001",
            transaction_type: "expense",
            amount: 50000,
            category_id: "cat-001",
            sub_category_id: "subcat-001",
            description: "Lunch at restaurant",
            receipt_date: "2025-04-30",
            merchant: "Restaurant ABC",
            location: "Jakarta",
            created_at: 1714503600000, // Apr 30, 2025
        },
        {
            id: "tx-002",
            transaction_type: "expense",
            amount: 200000,
            category_id: "cat-002",
            sub_category_id: "subcat-002",
            description: "Groceries",
            receipt_date: "2025-05-01",
            merchant: "Supermarket XYZ",
            location: "Jakarta",
            created_at: 1714590000000, // May 1, 2025
        },
        {
            id: "tx-003",
            transaction_type: "income",
            amount: 5000000,
            source: "Salary",
            saku: "Bank BCA",
            date: "2025-05-01",
            description: "Monthly salary",
            created_at: 1714590000000, // May 1, 2025
        }
    ],
    categories: [
        { id: "cat-001", name: "Food & Beverage", type: "expense" },
        { id: "cat-002", name: "Groceries", type: "expense" },
        { id: "cat-003", name: "Transportation", type: "expense" },
        { id: "cat-004", name: "Income", type: "income" },
        { id: "cat-005", name: "Salary", type: "income" },
    ],
    subcategories: [
        { id: "subcat-001", category_id: "cat-001", name: "Restaurant" },
        { id: "subcat-002", category_id: "cat-002", name: "Supermarket" },
        { id: "subcat-003", category_id: "cat-003", name: "Fuel" },
    ],
    budgets: [
        {
            id: "budget-001",
            period: "monthly",
            start_date: "2025-05-01",
            end_date: "2025-05-31",
            type: "personal",
            category_id: "cat-001",
            amount: 1000000,
            description: "Monthly food budget",
        },
        {
            id: "budget-002",
            period: "monthly",
            start_date: "2025-05-01",
            end_date: "2025-05-31",
            type: "personal",
            category_id: "cat-002",
            amount: 800000,
            description: "Monthly groceries budget",
        }
    ]
};

// Utility functions
function parseDate(dateString: string): number {
    return new Date(dateString).getTime();
}

function formatDate(timestamp: number): string {
    return new Date(timestamp).toISOString().split('T')[0];
}

// Register tools

// 1. Get Last Transaction
server.tool(
    "get_last_transaction",
    "Mendapatkan transaksi terakhir expense atau income",
    {
        transaction_type: z.string().optional().describe("Tipe transaksi yang ingin dicari (optional) expense atau income"),
        limit: z.number().int().default(3).describe("Jumlah transaksi yang akan di ambil, default 3"),
    },
    async ({ transaction_type, limit }, extra) => {
        let transactions = [...mockDB.transactions];

        // Filter by transaction type if provided
        if (transaction_type) {
            transactions = transactions.filter(tx => tx.transaction_type === transaction_type);
        }

        // Sort by created_at in descending order (newest first)
        transactions.sort((a, b) => b.created_at - a.created_at);

        // Limit the number of transactions
        const limitedTransactions = transactions.slice(0, limit);

        if (limitedTransactions.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Tidak ada transaksi ditemukan.",
                    },
                ],
            };
        }

        const formattedTransactions = limitedTransactions.map(tx => {
            const baseInfo = {
                id: tx.id,
                transaction_type: tx.transaction_type,
                amount: tx.amount,
                date: tx.transaction_type === "expense" ? tx.receipt_date : tx.date,
                description: tx.description,
            };

            if (tx.transaction_type === "expense") {
                const category = mockDB.categories.find(c => c.id === tx.category_id);
                const subcategory = mockDB.subcategories.find(sc => sc.id === tx.sub_category_id);

                return {
                    ...baseInfo,
                    category: category?.name ?? "Unknown",
                    subcategory: subcategory?.name ?? "Unknown",
                    merchant: tx.merchant,
                    location: tx.location,
                };
            } else {
                return {
                    ...baseInfo,
                    source: tx.source,
                    saku: tx.saku,
                };
            }
        });

        return {
            content: [
                {
                    type: "text",
                    text: `${limitedTransactions.length} transaksi terakhir:`,
                },
                {
                    type: "text",
                    text: JSON.stringify(formattedTransactions),
                }
            ],
        };
    },
);

// 2. Top Expense By Category
server.tool(
    "top_expense_by_category",
    "Menentukan kategori pengeluaran paling banyak dalam range tanggal tertentu",
    {
        start_date: z.string().describe("Tanggal mulai dalam format YYYY-MM-DD"),
        end_date: z.string().describe("Tanggal akhir dalam format YYYY-MM-DD"),
    },
    async ({ start_date, end_date }, extra) => {
        const startTimestamp = parseDate(start_date);
        const endTimestamp = parseDate(end_date) + (24 * 60 * 60 * 1000 - 1); // End of day

        // Filter expenses in the date range
        const expenses = mockDB.transactions.filter(tx =>
            tx.transaction_type === "expense" &&
            tx.created_at >= startTimestamp &&
            tx.created_at <= endTimestamp
        );

        if (expenses.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Tidak ada pengeluaran dalam rentang tanggal ${start_date} hingga ${end_date}.`,
                    },
                ],
            };
        }

        // Group expenses by category
        const expensesByCategory: Record<string, number> = {};
        expenses.forEach(expense => {
            if (expense.category_id) {
                expensesByCategory[expense.category_id] ??= 0;
                expensesByCategory[expense.category_id] += expense.amount;
            }
        });

        // Sort categories by expense amount
        const sortedCategories = Object.entries(expensesByCategory)
            .map(([categoryId, amount]) => {
                const category = mockDB.categories.find(c => c.id === categoryId);
                return {
                    category_id: categoryId,
                    category_name: category?.name ?? "Unknown",
                    total_amount: amount,
                };
            })
            .sort((a, b) => b.total_amount - a.total_amount);

        return {
            content: [
                {
                    type: "text",
                    text: `Top pengeluaran berdasarkan kategori (${start_date} - ${end_date}):`,
                },
                {
                    type: "text",
                    text: JSON.stringify(sortedCategories),
                }
            ],
        };
    },
);

// 3. Create Expense
server.tool(
    "create_expense",
    "Create an expense with fields for receipt date, amount, category, and description",
    {
        receipt_date: z.string().optional().describe("The date when the receipt was issued in YYYY-MM-DD format (Optional)"),
        amount: z.number().positive().describe("The amount of expense"),
        category_id: z.string().describe("The category ID under which the expense falls (Optional)"),
        sub_category_id: z.string().describe("The Sub category ID under which the expense falls (Optional)"),
        description: z.string().describe("A detailed description of the expense (Optional)"),
    },
    async ({ receipt_date, amount, category_id, sub_category_id, description }, extra) => {
        // Validate category and subcategory
        const category = mockDB.categories.find(c => c.id === category_id);
        if (!category) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Kategori dengan ID ${category_id} tidak ditemukan.`,
                    },
                ],
            };
        }

        const subcategory = mockDB.subcategories.find(sc => sc.id === sub_category_id);
        if (!subcategory) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Sub kategori dengan ID ${sub_category_id} tidak ditemukan.`,
                    },
                ],
            };
        }

        // Create new expense transaction
        const newTransaction = {
            id: `tx-${mockDB.transactions.length + 1}`.padStart(6, '0'),
            transaction_type: "expense",
            amount,
            category_id,
            sub_category_id,
            description,
            receipt_date: receipt_date ?? formatDate(Date.now()),
            merchant: "Unknown", // Default value
            location: "Unknown", // Default value
            created_at: Date.now(),
        };

        // Add to mock database
        mockDB.transactions.push(newTransaction);

        // Format the transaction data as a JSON string
        const transactionDetails = JSON.stringify({
            transaction_id: newTransaction.id,
            amount: newTransaction.amount,
            category: category.name,
            subcategory: subcategory.name,
            description: newTransaction.description,
            receipt_date: newTransaction.receipt_date,
        });

        return {
            content: [
                {
                    type: "text",
                    text: `Pengeluaran berhasil dibuat dengan ID: ${newTransaction.id}`,
                },
                {
                    type: "text",
                    text: transactionDetails,
                }
            ],
        };
    },
);

// 4. Get Current Date
server.tool(
    "get_current_date",
    "Get the current date in milliseconds since the Unix epoch",
    {
        timezone: z.string().optional().describe("The timezone for the current date (Optional)"),
    },
    async ({ timezone }, extra) => {
        const now = new Date();
        let currentDate = now;

        // If timezone is provided, convert to that timezone
        if (timezone) {
            try {
                const options: Intl.DateTimeFormatOptions = { timeZone: timezone };
                const formatter = new Intl.DateTimeFormat('en-US', options);
                const formattedDate = formatter.format(now);
                currentDate = new Date(formattedDate);
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting timezone: ${timezone}. Using system default.`,
                        },
                    ],
                };
            }
        }

        const dateInfo = {
            timestamp: currentDate.getTime(),
            iso_date: currentDate.toISOString(),
            formatted_date: currentDate.toISOString().split('T')[0],
        };

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(dateInfo)
                }
            ],
        };
    },
);

// 5. Detail Transaction
server.tool(
    "detail_transaction",
    "Detail transaction with transaction id",
    {
        transaction_id: z.string().describe("Unique identifier for the transaction"),
    },
    async ({ transaction_id }, extra) => {
        const transaction = mockDB.transactions.find(tx => tx.id === transaction_id);

        if (!transaction) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Transaksi dengan ID ${transaction_id} tidak ditemukan.`,
                    },
                ],
            };
        }

        let detailedTransaction;

        if (transaction.transaction_type === "expense") {
            const category = mockDB.categories.find(c => c.id === transaction.category_id);
            const subcategory = mockDB.subcategories.find(sc => sc.id === transaction.sub_category_id);

            detailedTransaction = {
                ...transaction,
                category_name: category?.name ?? "Unknown",
                subcategory_name: subcategory?.name ?? "Unknown",
            };
        } else {
            detailedTransaction = transaction;
        }

        return {
            content: [
                {
                    type: "text",
                    text: `Detail transaksi ${transaction_id}:`,
                },
                {
                    type: "text",
                    text: JSON.stringify(detailedTransaction),
                }
            ],
        };
    },
);

// 6. Get Transactions
server.tool(
    "get_transactions",
    "Dapatkan transaksi berdasarkan date range dan type transaksi, marchant dan lokasi",
    {
        start_date: z.string().describe("Tanggal awal dari rentang waktu dalam format YYYY-MM-DD"),
        end_date: z.string().describe("Tanggal akhir dari rentang waktu dalam format YYYY-MM-DD"),
        transaction_type: z.string().optional().describe("Jenis transaksi yang ingin dicari (optional)"),
        merchant: z.string().optional().describe("Nama merchant untuk transaksi (optional)"),
        location: z.string().optional().describe("Lokasi di mana transaksi terjadi (optional)"),
    },
    async ({ start_date, end_date, transaction_type, merchant, location }, extra) => {
        const startTimestamp = parseDate(start_date);
        const endTimestamp = parseDate(end_date) + (24 * 60 * 60 * 1000 - 1); // End of day

        // Filter transactions
        let transactions = mockDB.transactions.filter(tx => {
            const txDate = tx.created_at;
            return txDate >= startTimestamp && txDate <= endTimestamp;
        });

        // Apply additional filters if provided
        if (transaction_type) {
            transactions = transactions.filter(tx => tx.transaction_type === transaction_type);
        }

        if (merchant) {
            transactions = transactions.filter(tx =>
                tx.transaction_type === "expense" &&
                tx.merchant?.toLowerCase().includes(merchant.toLowerCase())
            );
        }

        if (location) {
            transactions = transactions.filter(tx =>
                tx.transaction_type === "expense" &&
                tx.location?.toLowerCase().includes(location.toLowerCase())
            );
        }

        if (transactions.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Tidak ada transaksi ditemukan dengan filter yang diberikan.`,
                    },
                ],
            };
        }

        // Add category and subcategory names for expenses
        const detailedTransactions = transactions.map(tx => {
            if (tx.transaction_type === "expense") {
                const category = mockDB.categories.find(c => c.id === tx.category_id);
                const subcategory = mockDB.subcategories.find(sc => sc.id === tx.sub_category_id);

                return {
                    ...tx,
                    category_name: category?.name ?? "Unknown",
                    subcategory_name: subcategory?.name ?? "Unknown",
                };
            }
            return tx;
        });

        return {
            content: [
                {
                    type: "text",
                    text: `Ditemukan ${transactions.length} transaksi dari ${start_date} hingga ${end_date}:`,
                },
                {
                    type: "text",
                    text: JSON.stringify(detailedTransactions),
                }
            ],
        };
    },
);

// 7. Create Income
server.tool(
    "create_income",
    "Creates a new income record",
    {
        amount: z.number().positive().describe("The amount of income"),
        source: z.string().describe("The source of income, e.g. salary, investment"),
        saku: z.string().describe("Tempat menyimpan pemasukan, e.g. Tunai, Bank BCA"),
        date: z.string().describe("The date the income was received, in YYYY-MM-DD format"),
        description: z.string().describe("A brief description of the income source"),
    },
    async ({ amount, source, saku, date, description }, extra) => {
        // Create new income transaction
        const newTransaction = {
            id: `tx-${mockDB.transactions.length + 1}`.padStart(6, '0'),
            transaction_type: "income",
            amount,
            source,
            saku,
            date,
            description,
            created_at: Date.now(),
        };

        // Add to mock database
        mockDB.transactions.push(newTransaction);

        // Format transaction data as JSON string
        const transactionDetails = JSON.stringify({
            transaction_id: newTransaction.id,
            amount: newTransaction.amount,
            source: newTransaction.source,
            saku: newTransaction.saku,
            date: newTransaction.date,
            description: newTransaction.description,
        });

        return {
            content: [
                {
                    type: "text",
                    text: `Pemasukan berhasil dibuat dengan ID: ${newTransaction.id}`,
                },
                {
                    type: "text",
                    text: transactionDetails,
                }
            ],
        };
    },
);

// 8. Get Budgets
server.tool(
    "get_budgets",
    "Get budgets based on year_month, type, and category",
    {
        year_month: z.string().describe("Year and month for budget query in YYYY-MM format"),
        type: z.string().optional().describe("Type of the budget (e.g., 'personal', 'business') (Optional)"),
        category: z.string().optional().describe("Category of the budget (e.g., 'food', 'transport') (Optional)"),
    },
    async ({ year_month, type, category }, extra) => {
        const [year, month] = year_month.split('-').map(Number);

        if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Format tahun-bulan tidak valid. Gunakan format YYYY-MM, contoh: 2025-05.`,
                    },
                ],
            };
        }

        // Get start and end of month
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        // Filter budgets
        let budgets = mockDB.budgets.filter(budget => {
            const budgetStart = parseDate(budget.start_date);
            const budgetEnd = parseDate(budget.end_date);

            return (
                (budgetStart <= endDate.getTime() && budgetEnd >= startDate.getTime()) ||
                (budget.period === "monthly" &&
                    new Date(budget.start_date).getMonth() + 1 === month &&
                    new Date(budget.start_date).getFullYear() === year)
            );
        });

        if (type) {
            budgets = budgets.filter(budget => budget.type === type);
        }

        if (category) {
            const categoryIds = mockDB.categories
                .filter(c => c.name.toLowerCase().includes(category.toLowerCase()))
                .map(c => c.id);

            budgets = budgets.filter(budget => categoryIds.includes(budget.category_id));
        }

        if (budgets.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Tidak ada anggaran ditemukan untuk periode ${year_month}.`,
                    },
                ],
            };
        }

        // Add category names
        const detailedBudgets = budgets.map(budget => {
            const category = mockDB.categories.find(c => c.id === budget.category_id);

            return {
                ...budget,
                category_name: category?.name ?? "Unknown",
            };
        });

        return {
            content: [
                {
                    type: "text",
                    text: `Anggaran untuk periode ${year_month}:`,
                },
                {
                    type: "text",
                    text: JSON.stringify(detailedBudgets),
                }
            ],
        };
    },
);

// 9. Create Budget
server.tool(
    "create_budget",
    "Create a budget(Anggaran) based on the specified parameters",
    {
        period: z.string().describe("The budget period (daily,weekly,monthly,yearly,custom)"),
        start_date: z.string().describe("The starting date of the budget in YYYY-MM-DD format"),
        end_date: z.string().describe("The end date of the budget in YYYY-MM-DD format only when period `custom`"),
        type: z.string().describe("Type of budget (e.g., personal, business)"),
        category_id: z.string().describe("category_id from function `get_categories`"),
        amount: z.number().positive().describe("The amount allocated for the budget"),
        description: z.string().describe("Description of the budget"),
    },
    async ({ period, start_date, end_date, type, category_id, amount, description }, extra) => {
        // Validate period
        const validPeriods = ["daily", "weekly", "monthly", "yearly", "custom"];
        if (!validPeriods.includes(period)) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Periode anggaran tidak valid. Gunakan salah satu dari: ${validPeriods.join(", ")}.`,
                    },
                ],
            };
        }

        // Validate category
        const category = mockDB.categories.find(c => c.id === category_id);
        if (!category) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Kategori dengan ID ${category_id} tidak ditemukan.`,
                    },
                ],
            };
        }

        // Validate dates
        const startTimestamp = parseDate(start_date);
        if (isNaN(startTimestamp)) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Format tanggal mulai tidak valid. Gunakan format YYYY-MM-DD.`,
                    },
                ],
            };
        }

        let endTimestamp;
        let calculatedEndDate;
        if (period === "custom") {
            if (!end_date) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Tanggal akhir diperlukan untuk periode kustom.`,
                        },
                    ],
                };
            }

            endTimestamp = parseDate(end_date);
            if (isNaN(endTimestamp)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Format tanggal akhir tidak valid. Gunakan format YYYY-MM-DD.`,
                        },
                    ],
                };
            }

            if (endTimestamp < startTimestamp) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Tanggal akhir tidak boleh sebelum tanggal mulai.`,
                        },
                    ],
                };
            }
        } else {
            // Calculate end date based on period
            const startDate = new Date(startTimestamp);
            calculatedEndDate = new Date(startDate);

            switch (period) {
                case "daily":
                    // Tidak perlu diubah, sama dengan startDate
                    break;
                case "weekly":
                    calculatedEndDate.setDate(calculatedEndDate.getDate() + 6); // 7 days
                    break;
                case "monthly":
                    calculatedEndDate.setMonth(calculatedEndDate.getMonth() + 1);
                    calculatedEndDate.setDate(0); // Last day of the month
                    break;
                case "yearly":
                    calculatedEndDate.setFullYear(calculatedEndDate.getFullYear() + 1);
                    calculatedEndDate.setDate(calculatedEndDate.getDate() - 1); // One year minus one day
                    break;
            }

            end_date = formatDate(calculatedEndDate.getTime());
        }

        // Create new budget
        const newBudget = {
            id: `budget-${mockDB.budgets.length + 1}`.padStart(7, '0'),
            period,
            start_date,
            end_date,
            type,
            category_id,
            amount,
            description,
        };

        // Add to mock database
        mockDB.budgets.push(newBudget);

        // Format budget data as JSON string
        const budgetDetails = JSON.stringify({
            budget_id: newBudget.id,
            period: newBudget.period,
            start_date: newBudget.start_date,
            end_date: newBudget.end_date,
            type: newBudget.type,
            category: category.name,
            amount: newBudget.amount,
            description: newBudget.description,
        });

        return {
            content: [
                {
                    type: "text",
                    text: `Anggaran berhasil dibuat dengan ID: ${newBudget.id}`,
                },
                {
                    type: "text",
                    text: budgetDetails,
                }
            ],
        };
    },
);

// 10. Get Categories
server.tool(
    "get_categories",
    "Get categories for by name and type",
    {
        name: z.string().optional().describe("The name of category (Optional)"),
        type: z.enum(["expense", "budget", "income"]).describe("The type of the item, either 'expense' or 'budget' or 'income'"),
    },
    async ({ name, type }, extra) => {
        let categories = [...mockDB.categories];

        // Filter by type
        categories = categories.filter(c => c.type === type);

        // Filter by name if provided
        if (name) {
            categories = categories.filter(c =>
                c.name.toLowerCase().includes(name.toLowerCase())
            );
        }

        if (categories.length === 0) {
            let messageText = `Tidak ada kategori ${type} ditemukan`;
            if (name) {
                messageText += ` dengan nama yang mengandung "${name}"`;
            }
            messageText += ".";

            return {
                content: [
                    {
                        type: "text",
                        text: messageText,
                    },
                ],
            };
        }

        // For expense categories, add subcategories
        if (type === "expense") {
            const categoriesWithSubcategories = categories.map(category => {
                const subcategories = mockDB.subcategories
                    .filter(sc => sc.category_id === category.id)
                    .map(sc => ({
                        id: sc.id,
                        name: sc.name,
                    }));

                return {
                    ...category,
                    subcategories,
                };
            });

            return {
                content: [
                    {
                        type: "text",
                        text: `Ditemukan ${categories.length} kategori ${type}:`,
                    },
                    {
                        type: "text",
                        text: JSON.stringify(categoriesWithSubcategories),
                    }
                ],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: `Ditemukan ${categories.length} kategori ${type}:`,
                },
                {
                    type: "text",
                    text: JSON.stringify(categories),
                }
            ],
        };
    },
);

// 11. Get Expenses By Category
server.tool(
    "get_expenses_by_category",
    "Get expenses by category.",
    {
        category_id: z.string().describe("Category ID"),
        sub_category_id: z.string().optional().describe("Sub Category ID"),
        start_date: z.string().describe("Start date for the expenses in YYYY-MM-DD format"),
        end_date: z.string().describe("End date for the expenses in YYYY-MM-DD format"),
    },
    async ({ category_id, sub_category_id, start_date, end_date }, extra) => {
        const startTimestamp = parseDate(start_date);
        const endTimestamp = parseDate(end_date) + (24 * 60 * 60 * 1000 - 1); // End of day

        // Validate category
        const category = mockDB.categories.find(c => c.id === category_id);
        if (!category) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Kategori dengan ID ${category_id} tidak ditemukan.`,
                    },
                ],
            };
        }

        // Validate subcategory if provided
        if (sub_category_id) {
            const subcategory = mockDB.subcategories.find(sc => sc.id === sub_category_id);
            if (!subcategory) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Sub kategori dengan ID ${sub_category_id} tidak ditemukan.`,
                        },
                    ],
                };
            }
        }

        // Filter expenses
        let expenses = mockDB.transactions.filter(tx =>
            tx.transaction_type === "expense" &&
            tx.category_id === category_id &&
            tx.created_at >= startTimestamp &&
            tx.created_at <= endTimestamp
        );

        // Filter by subcategory if provided
        if (sub_category_id) {
            expenses = expenses.filter(tx => tx.sub_category_id === sub_category_id);
        }

        if (expenses.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Tidak ada pengeluaran ditemukan untuk kategori ${category.name} dalam periode ${start_date} hingga ${end_date}.`,
                    },
                ],
            };
        }

        // Calculate total amount
        const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);

        // Add subcategory names
        const detailedExpenses = expenses.map(expense => {
            const subcategory = mockDB.subcategories.find(sc => sc.id === expense.sub_category_id);

            return {
                ...expense,
                category_name: category.name,
                subcategory_name: subcategory?.name ?? "Unknown",
            };
        });

        // Format response data as JSON string
        const expensesData = {
            category: category.name,
            total_amount: totalAmount,
            transaction_count: expenses.length,
            transactions: detailedExpenses,
        };

        return {
            content: [
                {
                    type: "text",
                    text: `Pengeluaran untuk kategori ${category.name} (${start_date} - ${end_date}):`,
                },
                {
                    type: "text",
                    text: JSON.stringify(expensesData),
                }
            ],
        };
    },
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Ximply MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});