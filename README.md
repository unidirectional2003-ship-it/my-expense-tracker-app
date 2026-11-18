Live app: https://unidirectional2003-ship-it.github.io/my-expense-tracker-app/

# Expense Tracker

A tracker for the money that runs your home and the money that runs your small business. Household spending stays in one place. Business spending, orders, sales, and profit stay in another. Everything is saved in this browser, so you can close the tab and come back to the same numbers.

## Features

- **Password lock.** The app asks for a password when you open it, and again after you leave it in the background. Only a salted hash is stored.
- **Face ID / fingerprint.** On a phone that supports it, you can unlock with the device authenticator. The password still works if that is unavailable.
- **Forgot password.** Resetting erases the data on this device. It does not reveal it. Import a backup afterward if you have one.
- **Backup and restore.** Settings exports a JSON file of what is saved here, and import replaces that data. Your password does not change.
- **Menu.** Home, Orders, Work, Expenses, Groceries, Beauty, Clothing, Checklist, Pending Approvals, Alerts, Budgets, Reports, and Settings. On a phone, Menu opens the full list, and the bottom bar keeps the main sections one tap away.
- **Dashboard.** Personal balance, business balance, earned revenue, cash received, customer advances, expenses, profit, savings, outstanding payments, and upcoming bills for the month you pick.
- **Income charts.** Income versus expenses, where the money went, and the revenue and profit trend for the last six months. Amounts are shown as Rs.
- **Home and Business.** Household costs and shop costs stay in separate lists, with their own categories, search, and filters.
- **Add, edit, and delete an expense.** Amount, category, date, and note are required. The amount must be greater than zero, with at most two decimal places.
- **Repeats every month.** A home expense such as rent can be marked to come back on its own at the start of each new month.
- **Scan a receipt.** Take a photo or choose one from the gallery. If the camera is blocked or the total cannot be read, you can type the details or save without the photo.
- **Groceries, beauty, clothing, and the other lists.** Each list saves into home or business expenses. Groceries can remember a monthly template and prepare next month’s list for approval.
- **Checklist.** Monthly bills and other regular items, with what is paid and what is still due. Past months stay as they were.
- **Orders and payments.** Record a customer order and the payments against it. The balance is the order total minus what has been paid. An empty list says “No orders yet” and offers Add order.
- **Work.** Each order has a work status, from not started through delivered.
- **Pending approvals.** Prepared grocery lists, checklist items, and repeating business costs wait here until you approve them. Nothing is added to your totals before that.
- **Alerts.** Open alerts for budgets, checklist items, orders, and work. Ignore hides one until tomorrow. Resolve moves it to history. The same alert is not listed twice.
- **Budgets.** Monthly limits for groceries, beauty, clothing, household, business supplies, and overall spending.
- **Home summary and savings.** A monthly home budget, money left, a progress bar, a daily limit, spending by category, and a savings goal.
- **Profit.** Earned revenue, cash received, advances, outstanding amounts, business expenses, and actual profit. Advances are cash in, and they are not profit.
- **Saved in this browser.** Expenses, orders, sales, budgets, checklist, and receipt photos stay on this device. There is no account.

## Install on your phone

1. Open the live app in Safari on iPhone, or in Chrome on Android.
2. iPhone: tap Share, then **Add to Home Screen**.
3. Android: tap the browser menu, then **Add to Home screen** or **Install app**.
4. Open **My Expenses** from your home screen. It uses the app icon and stays on this phone’s saved data.

## How to back up your data

1. Unlock the app and open **Settings**.
2. Tap **Export backup**. A JSON file downloads. Keep that file somewhere safe, such as Files or a computer. It is the copy you need if you forget the password or change phones.
3. To bring a backup back, open **Settings**, tap **Import backup**, choose the JSON file, and confirm **Replace data**. This replaces the expenses, orders, and other records on this device. Your password stays as it is.
4. If you forget the password, the app cannot show the old numbers. After you erase and create a new password, use **Import backup** if you still have the file.

## How to use

1. The first time, create a password of at least 6 characters.
2. Stay on **Home** for the dashboard, household costs, and the business space. Use the top menu for orders, groceries, the checklist, approvals, alerts, and budgets.
3. Add an expense with an amount, a category, a date, and a note. On Home, tick **Repeats every month** for bills that come back.
4. On Home, open **Summary**, pick a month, and save a budget. Check money left, your daily limit, and spending by category.
5. On Business, open **Income / Sales** to record money coming in, then open **Profit**.
6. Export a backup from **Settings** whenever the numbers matter.

## Built with

HTML, CSS, JavaScript, localStorage
