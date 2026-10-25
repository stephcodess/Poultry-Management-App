const { contextBridge, ipcRenderer } = require('electron')

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

let _session = null

contextBridge.exposeInMainWorld('api', {
  // Auth
  auth: {
    checkEmail: (data) => invoke('auth:checkEmail', data),
    login: (data) => invoke('auth:login', data),
    activateByEmail: (data) => invoke('auth:activateByEmail', data),
    logout: () => invoke('auth:logout', _session),
    loadSession: () => invoke('auth:loadSession'),
    saveSession: (s) => invoke('auth:saveSession', s),
    inviteUser: (data) => invoke('auth:inviteUser', data, _session),
    getUsers: () => invoke('auth:getUsers', _session),
    updateUser: (data) => invoke('auth:updateUser', data, _session),
    deleteUser: (data) => invoke('auth:deleteUser', data, _session),
    changePassword: (data) => invoke('auth:changePassword', data, _session),
    resetUserPassword: (data) => invoke('auth:resetUserPassword', data, _session),
    setOwnerPassword: (data) => invoke('auth:setOwnerPassword', data),
    getActivity: (opts) => invoke('auth:getActivity', opts),
    setSession: (s) => { _session = s },
    getSession: () => _session,
  },

  // Flocks
  flocks: {
    getAll: () => invoke('flocks:getAll'),
    add: (flock) => invoke('flocks:add', flock, _session),
    update: (id, flock) => invoke('flocks:update', id, flock, _session),
    delete: (id) => invoke('flocks:delete', id, _session),
  },

  // Production
  production: {
    getAll: (monthYear) => invoke('production:getAll', monthYear),
    add: (record) => invoke('production:add', record, _session),
    update: (id, record) => invoke('production:update', id, record, _session),
    delete: (id) => invoke('production:delete', id, _session),
    getSummary: (monthYear) => invoke('production:getSummary', monthYear),
    getOpening: (monthYear) => invoke('production:getOpening', monthYear),
  },

  // Sales
  sales: {
    getAll: (monthYear) => invoke('sales:getAll', monthYear),
    add: (record) => invoke('sales:add', record, _session),
    update: (id, record) => invoke('sales:update', id, record, _session),
    delete: (id) => invoke('sales:delete', id, _session),
    getSummary: (monthYear) => invoke('sales:getSummary', monthYear),
  },

  // Domestic Usage
  domestic: {
    getAll: (monthYear) => invoke('domestic:getAll', monthYear),
    add: (record) => invoke('domestic:add', record, _session),
    update: (id, record) => invoke('domestic:update', id, record, _session),
    delete: (id) => invoke('domestic:delete', id, _session),
  },

  // Expenses
  expenses: {
    getAll: (monthYear) => invoke('expenses:getAll', monthYear),
    add: (record) => invoke('expenses:add', record, _session),
    update: (id, record) => invoke('expenses:update', id, record, _session),
    delete: (id) => invoke('expenses:delete', id, _session),
    getSummary: (monthYear) => invoke('expenses:getSummary', monthYear),
  },

  // Settings
  settings: {
    get: () => invoke('settings:get'),
    update: (settings) => invoke('settings:update', settings),
    getPrices: () => invoke('settings:getPrices'),
    addPrice: (price) => invoke('settings:addPrice', price),
    updatePrice: (id, price) => invoke('settings:updatePrice', id, price),
    deletePrice: (id) => invoke('settings:deletePrice', id),
  },

  // Dashboard
  dashboard: {
    getSummary: (monthYear) => invoke('dashboard:getSummary', monthYear),
    getMonths: () => invoke('dashboard:getMonths'),
  },

  // Mortality
  mortality: {
    getAll: (monthYear) => invoke('mortality:getAll', monthYear),
    add: (record) => invoke('mortality:add', record, _session),
    update: (id, record) => invoke('mortality:update', id, record, _session),
    delete: (id) => invoke('mortality:delete', id, _session),
    getSummary: (monthYear) => invoke('mortality:getSummary', monthYear),
    getRange: (opts) => invoke('mortality:getRange', opts),
  },

  // Feed Log
  feed: {
    getAll: (monthYear) => invoke('feed:getAll', monthYear),
    add: (record) => invoke('feed:add', record, _session),
    update: (id, record) => invoke('feed:update', id, record, _session),
    delete: (id) => invoke('feed:delete', id, _session),
    getSummary: (monthYear) => invoke('feed:getSummary', monthYear),
    getStock: () => invoke('feed:getStock'),
    getRange: (opts) => invoke('feed:getRange', opts),
  },

  // Health Records
  health: {
    getAll: (monthYear) => invoke('health:getAll', monthYear),
    getUpcoming: () => invoke('health:getUpcoming'),
    add: (record) => invoke('health:add', record, _session),
    update: (id, record) => invoke('health:update', id, record, _session),
    delete: (id) => invoke('health:delete', id, _session),
    getSummary: (monthYear) => invoke('health:getSummary', monthYear),
    getRange: (opts) => invoke('health:getRange', opts),
  },

  // Monthly Balance
  balance: {
    get: (monthYear) => invoke('balance:get', monthYear),
    getAll: () => invoke('balance:getAll'),
    upsert: (data) => invoke('balance:upsert', data),
    rollover: (data) => invoke('balance:rollover', data),
    autoLoad: (monthYear) => invoke('balance:autoLoad', monthYear),
  },

  // PDF Export
  pdf: {
    export: (payload) => invoke('pdf:export', payload),
  },

  // AI Chat
  ai: {
    chat: (payload) => invoke('ai:chat', payload),
  },

  // Water Log
  water: {
    getAll: (monthYear) => invoke('water:getAll', monthYear),
    add: (record) => invoke('water:add', record, _session),
    update: (id, record) => invoke('water:update', id, record, _session),
    delete: (id) => invoke('water:delete', id, _session),
    getSummary: (monthYear) => invoke('water:getSummary', monthYear),
    getRange: (opts) => invoke('water:getRange', opts),
  },

  // Reports
  report: {
    poultryControl: (opts) => invoke('report:poultryControl', opts),
  },

  sync: {
    toSupabase: () => invoke('sync:toSupabase'),
    fromSupabase: () => invoke('sync:fromSupabase'),
    flushQueue: () => invoke('sync:flushQueue'),
    getQueueCount: () => invoke('sync:getQueueCount'),
    getLastSync: () => invoke('sync:getLastSync'),
    saveLastSync: (iso) => invoke('sync:saveLastSync', iso),
  },

  // Debtors (credit customers + credit sales + payments)
  debtors: {
    getCustomers: () => invoke('debtors:getCustomers'),
    addCustomer: (record) => invoke('debtors:addCustomer', record, _session),
    updateCustomer: (id, record) => invoke('debtors:updateCustomer', id, record, _session),
    deleteCustomer: (id) => invoke('debtors:deleteCustomer', id, _session),
    getCreditSales: (filters) => invoke('debtors:getCreditSales', filters),
    addCreditSale: (record) => invoke('debtors:addCreditSale', record, _session),
    updateCreditSale: (id, record) => invoke('debtors:updateCreditSale', id, record, _session),
    deleteCreditSale: (id) => invoke('debtors:deleteCreditSale', id, _session),
    addPayment: (record) => invoke('debtors:addPayment', record, _session),
    getPayments: (creditSaleId) => invoke('debtors:getPayments', creditSaleId),
    getSummary: (monthYear) => invoke('debtors:getSummary', monthYear),
  },
})
