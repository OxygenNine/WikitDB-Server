// components/Layout.js
import React from 'react';
import Header from './Header';
import Footer from './Footer';

const Layout = ({ children }) => {
    return (
        <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 transition-colors duration-300">
            <Header />
            <main className="flex-grow mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 w-full">
                {children}
            </main>
            <Footer />
        </div>
    );
};

export default Layout;
