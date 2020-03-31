import { Reducer } from "redux";
import { History } from "history";
import { PersistConfig } from "redux-persist";
export interface IState {
    isFetching: boolean;
    loaded?: {
        [key: string]: boolean;
    };
    items?: {
        [key: string]: any;
    };
    metadata?: {
        [key: string]: any;
    };
}
interface IAction {
    type: string;
    payload: any;
}
interface IModule {
    reducer: (state: IState, action: IAction) => any;
    sagas: (() => void)[];
    actions: {
        [key: string]: (_: any) => IAction;
    };
}
interface IInput {
    action: string;
    apiPayload: (_payload: any) => any;
    onRequest?: (state: IState, payload: any) => any;
    onSuccess?: (state: IState, payload: any) => any;
    onFailure?: (state: IState, payload: any) => any;
}
export declare const buildModule: (inputs: IInput[]) => (initState: Function | IState) => IModule;
export declare function rootSaga(functions: (() => void)[]): Generator<import("redux-saga/effects").AllEffect<import("redux-saga/effects").ForkEffect<void>>, void, unknown>;
export declare function rootReducers(history: History, reducerMap: {
    [key: string]: () => void;
}): Reducer;
export declare function configStore(initialState: any, opts: {
    persistConfig: PersistConfig<any>;
    reducer: (_: History) => Reducer;
    saga: any;
    debug?: boolean;
}): {
    store: import("redux").Store<any, import("redux").AnyAction> & {
        dispatch: unknown;
    };
    history: History<History.PoorMansUnknown>;
    persistor: import("redux-persist").Persistor;
};
export declare const sum: (a: number, b: number) => number;
export {};
