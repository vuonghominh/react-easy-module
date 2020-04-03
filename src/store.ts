import { createStore, applyMiddleware, combineReducers } from "redux";
import createSagaMiddleware from "redux-saga";
import { composeWithDevTools } from "redux-devtools-extension";
import { createBrowserHistory } from "history";
import { routerMiddleware, connectRouter } from "connected-react-router";
import { persistStore, persistReducer } from "redux-persist";
import storage from "redux-persist/lib/storage";
import { all, fork } from "redux-saga/effects";
import { errorReducer, errorSaga } from "./middlewares/error";

function sagaWatcher(functions: (() => void)[]) {
  return function* () {
    yield all([...functions.map(fn => fork(fn)), fork(errorSaga)]);
  }
}

type OptsType = {
  appName: string
  reducerMap: { [key: string]: (state: any, action: any) => any }
  sagas: (() => void)[]
  debug?: boolean
}

export function configStore( initialState: any, opts: OptsType) {
  const { appName, sagas, reducerMap, debug } = opts;
  const persistConfig = {
    key: appName,
    storage,
    whitelist: []
  };
  const history = createBrowserHistory();
  const reducer: any = combineReducers({
    router: connectRouter(history),
    error: errorReducer,
    ...reducerMap
  });
  const persistedReducer = persistReducer(persistConfig, reducer);
  const sagaMiddleware = createSagaMiddleware();
  const middlewares = [routerMiddleware(history), sagaMiddleware];
  const store = createStore(
    persistedReducer,
    initialState,
    debug
      ? composeWithDevTools(applyMiddleware(...middlewares))
      : applyMiddleware(...middlewares)
  );
  sagaMiddleware.run(sagaWatcher(sagas));
  return {
    store,
    history,
    persistor: persistStore(store)
  };
};