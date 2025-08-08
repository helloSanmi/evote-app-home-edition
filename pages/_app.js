// pages/_app.js
import Head from "next/head";
import '../styles/globals.css'; // Tailwind + any custom styles
import Layout from '../components/Layout';

function MyApp({ Component, pageProps }) {
  return (
    <>
      {/* Add a title and your logo as the browser favicon */}
      <Head>
        <title>Voting App</title>
        <link rel="icon" href="/logo.png" />
      </Head>

      <Layout>
        <Component {...pageProps} />
      </Layout>
    </>
  );
}

export default MyApp;
