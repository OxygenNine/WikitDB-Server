import '../styles/globals.css';
import Layout from '../components/Layout';
import ErrorBoundary from '../components/ErrorBoundary';

function MyApp({ Component, pageProps }) {
    return (
        <Layout>
            <ErrorBoundary>
                <Component {...pageProps} />
            </ErrorBoundary>
        </Layout>
    );
}

export default MyApp;
