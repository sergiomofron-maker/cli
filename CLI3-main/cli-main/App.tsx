import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Calendar from './components/Calendar';
import ShoppingList from './components/ShoppingList';
import Inventory from './components/Inventory';
import History from './components/History';
import Layout from './components/Layout';
import { mockDb } from './services/mockDb';
import { User } from './types';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'calendar' | 'shopping' | 'inventory' | 'history'>('calendar');

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (!user) return;
    mockDb.weeklyHistory.syncOnAppOpen(user.id, new Date());
  }, [user]);

  const checkUser = () => {
    const u = mockDb.auth.getUser();
    setUser(u);
    setLoading(false);
  };

  if (loading) return null;

  return (
    <HashRouter>
      {!user ? (
        <Login onLogin={checkUser} />
      ) : (
        <Layout activeTab={activeTab} setActiveTab={setActiveTab} onLogout={() => setUser(null)}>
          {activeTab === 'calendar' ? (
            <Calendar userId={user.id} />
          ) : activeTab === 'shopping' ? (
            <ShoppingList userId={user.id} />
          ) : activeTab === 'history' ? (
            <History userId={user.id} />
          ) : (
            <Inventory userId={user.id} />
          )}
        </Layout>
      )}
    </HashRouter>
  );
};

export default App;
