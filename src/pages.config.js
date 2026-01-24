import Admin from './pages/Admin';
import CatalogAdmin from './pages/CatalogAdmin';
import Feedback from './pages/Feedback';
import Landing from './pages/Landing';
import Main from './pages/Main';
import NearbyStores from './pages/NearbyStores';
import PriceComparison from './pages/PriceComparison';
import Receipt from './pages/Receipt';
import SmartCart from './pages/SmartCart';
import Upload from './pages/Upload';
import Profile from './pages/Profile';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Admin": Admin,
    "CatalogAdmin": CatalogAdmin,
    "Feedback": Feedback,
    "Landing": Landing,
    "Main": Main,
    "NearbyStores": NearbyStores,
    "PriceComparison": PriceComparison,
    "Receipt": Receipt,
    "SmartCart": SmartCart,
    "Upload": Upload,
    "Profile": Profile,
}

export const pagesConfig = {
    mainPage: "Landing",
    Pages: PAGES,
    Layout: __Layout,
};