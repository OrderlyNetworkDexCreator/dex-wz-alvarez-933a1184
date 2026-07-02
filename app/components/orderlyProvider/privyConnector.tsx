import { ReactNode, useCallback, useMemo, useState } from "react";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { QueryClient } from "@tanstack/query-core";
import {
  useLocalStorage,
  useStorageChain,
  WalletConnectorContext,
  useWalletConnector,
} from "@orderly.network/hooks";
import { ConnectorKey, type NetworkId } from "@orderly.network/types";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Divider,
  Text,
} from "@orderly.network/ui";
import {
  WalletConnectorPrivyProvider,
  Network,
} from "@orderly.network/wallet-connector-privy";
import {
  getRuntimeConfig,
  getRuntimeConfigBoolean,
} from "@/utils/runtime-config";
import { getEvmConnectors, getSolanaConfig } from "../../utils/walletConfig";

type LoginMethod = "email" | "passkey" | "twitter" | "google";

const getLoginMethods = (): LoginMethod[] => {
  const loginMethodsEnv = getRuntimeConfig("VITE_PRIVY_LOGIN_METHODS");
  if (!loginMethodsEnv) {
    return ["email"];
  }

  const validMethods: LoginMethod[] = ["email", "passkey", "twitter", "google"];

  return loginMethodsEnv
    .split(",")
    .map((method: string) => method.trim())
    .filter((method: string): method is LoginMethod =>
      validMethods.includes(method as LoginMethod),
    );
};

const getDefaultEvmChainId = (networkId: NetworkId) => {
  const configuredDefaultChain = Number(getRuntimeConfig("VITE_DEFAULT_CHAIN"));
  if (configuredDefaultChain) {
    return configuredDefaultChain;
  }

  const chains =
    networkId === "mainnet"
      ? getRuntimeConfig("VITE_ORDERLY_MAINNET_CHAINS")
      : getRuntimeConfig("VITE_ORDERLY_TESTNET_CHAINS");

  return (
    Number(chains?.split(",")[0]) || (networkId === "mainnet" ? 42161 : 421614)
  );
};

const getPrivyEmail = (
  user: ReturnType<typeof usePrivy>["user"],
): string | undefined => {
  const emailAccount = user?.linkedAccounts?.find(
    (account) => account.type === "email",
  );

  if (!emailAccount) {
    return undefined;
  }

  if ("email" in emailAccount && typeof emailAccount.email === "string") {
    return emailAccount.email;
  }

  return undefined;
};

const PrivyLoginOnlyWalletContext = ({
  children,
  networkId,
}: {
  children: ReactNode;
  networkId: NetworkId;
}) => {
  const walletConnector = useWalletConnector();
  const [, setConnectorKey] = useLocalStorage(ConnectorKey, "");
  const { setStorageChain } = useStorageChain();
  const { login } = useLogin();
  const { user } = usePrivy();
  const [showAccountDialog, setShowAccountDialog] = useState(false);

  const email = getPrivyEmail(user);

  const connect = useCallback(async () => {
    if (walletConnector.wallet) {
      setShowAccountDialog(true);
      return [];
    }

    setConnectorKey("privy");
    setStorageChain(getDefaultEvmChainId(networkId));
    login();
    return [];
  }, [login, networkId, setConnectorKey, setStorageChain, walletConnector]);

  const handleLogout = useCallback(async () => {
    await walletConnector.disconnect("privy");
    setShowAccountDialog(false);
  }, [walletConnector]);

  const value = useMemo(
    () => ({
      ...walletConnector,
      connect,
    }),
    [connect, walletConnector],
  );

  return (
    <WalletConnectorContext.Provider value={value}>
      {children}
      <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
        <DialogContent className="oui-w-[320px]">
          <DialogHeader>
            <DialogTitle>Account</DialogTitle>
          </DialogHeader>
          <Divider />
          <DialogBody className="oui-space-y-4">
            <div className="oui-space-y-1">
              <Text className="oui-break-all" size="xs" intensity={80}>
                {email || walletConnector.wallet?.accounts?.[0]?.address || "-"}
              </Text>
            </div>
            <Button
              className="oui-w-full"
              color="danger"
              size="md"
              onClick={handleLogout}
            >
              Log out
            </Button>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </WalletConnectorContext.Provider>
  );
};

const PrivyConnector = ({
  children,
  networkId,
}: {
  children: ReactNode;
  networkId: NetworkId;
}) => {
  const appId = getRuntimeConfig("VITE_PRIVY_APP_ID");
  if (!appId) {
    throw new Error(`VITE_PRIVY_APP_ID not set`);
  }
  const termsOfUseUrl = getRuntimeConfig("VITE_PRIVY_TERMS_OF_USE");
  const enableAbstractWallet = getRuntimeConfigBoolean(
    "VITE_ENABLE_ABSTRACT_WALLET",
  );
  const privyLoginOnly = getRuntimeConfigBoolean("VITE_PRIVY_LOGIN_ONLY");
  const disableEVMWallets = getRuntimeConfigBoolean("VITE_DISABLE_EVM_WALLETS");
  const disableSolanaWallets = getRuntimeConfigBoolean(
    "VITE_DISABLE_SOLANA_WALLETS",
  );
  const loginMethods = getLoginMethods();

  return (
    <WalletConnectorPrivyProvider
      network={networkId === "mainnet" ? Network.mainnet : Network.testnet}
      termsOfUse={termsOfUseUrl}
      wagmiConfig={
        privyLoginOnly || disableEVMWallets
          ? undefined
          : {
              connectors: getEvmConnectors(),
            }
      }
      solanaConfig={
        privyLoginOnly || disableSolanaWallets
          ? undefined
          : getSolanaConfig(networkId)
      }
      privyConfig={{
        config: {
          appearance: {
            showWalletLoginFirst: false,
          },
          loginMethods: loginMethods,
        },
        appid: appId,
      }}
      abstractConfig={
        enableAbstractWallet
          ? {
              queryClient: new QueryClient(),
            }
          : undefined
      }
    >
      {privyLoginOnly ? (
        <PrivyLoginOnlyWalletContext networkId={networkId}>
          {children}
        </PrivyLoginOnlyWalletContext>
      ) : (
        children
      )}
    </WalletConnectorPrivyProvider>
  );
};

export default PrivyConnector;
