import React from 'react'
import { PersistGate } from 'redux-persist/integration/react'
import { ConnectedRouter } from 'connected-react-router'
import { History } from "history"
import { Persistor } from "redux-persist"

export const sum = (a: number, b: number): number => a + b

type Props = {
  history: History,
  persistor: Persistor
}

export const RootModule: React.FC<Props> = ({children, history, persistor}) => (
  <PersistGate loading={null} persistor={persistor}>
    <ConnectedRouter history={history}>
      {children}
    </ConnectedRouter>
  </PersistGate>
)