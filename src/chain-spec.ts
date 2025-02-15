import { encodeAddress } from "@polkadot/util-crypto";
import { decorators } from "./utils/colors";
import { ChainSpec, HrmpChannelsConfig } from "./types";
import { readDataFile } from "./utils/fs-utils";
const fs = require("fs");
const debug = require("debug")("zombie::chain-spec");

// Get authority keys from within chainSpec data
function getAuthorityKeys(chainSpec: ChainSpec) {
  // Check runtime_genesis_config key for rococo compatibility.
  const runtimeConfig =
    chainSpec.genesis.runtime?.runtime_genesis_config ||
    chainSpec.genesis.runtime;
  if (runtimeConfig && runtimeConfig.session) {
    return runtimeConfig.session.keys;
  }

  // For retro-compatibility with substrate pre Polkadot 0.9.5
  if (runtimeConfig && runtimeConfig.palletSession) {
    return runtimeConfig.palletSession.keys;
  }

  console.error(
    `\n\t\t  ${decorators.red("⚠ session not found in runtimeConfig")}`
  );
  process.exit(1);
}

// Remove all existing keys from `session.keys`
export function clearAuthorities(spec: string) {
  let rawdata = fs.readFileSync(spec);
  let chainSpec;
  try {
    chainSpec = JSON.parse(rawdata);
  } catch {
    console.error(
      `\n\t\t  ${decorators.red("  ⚠ failed to parse the chain spec")}`
    );
    process.exit(1);
  }

  let keys = getAuthorityKeys(chainSpec);
  keys.length = 0;

  let data = JSON.stringify(chainSpec, null, 2);
  fs.writeFileSync(spec, data);
  console.log(
    `\n\t\t🧹 ${decorators.green("Starting with a fresh authority set...")}`
  );
}

// Add additional authorities to chain spec in `session.keys`
export async function addAuthority(spec: string, name: string, accounts: any) {
  const { sr_stash, sr_account, ed_account, ec_account } = accounts;

  let key = [
    sr_stash.address,
    sr_stash.address,
    {
      grandpa: ed_account.address,
      babe: sr_account.address,
      im_online: sr_account.address,
      parachain_validator: sr_account.address,
      authority_discovery: sr_account.address,
      para_validator: sr_account.address,
      para_assignment: sr_account.address,
      beefy: encodeAddress(ec_account.publicKey),
    },
  ];

  let rawdata = fs.readFileSync(spec);
  let chainSpec = JSON.parse(rawdata);

  let keys = getAuthorityKeys(chainSpec);
  keys.push(key);

  let data = JSON.stringify(chainSpec, null, 2);
  fs.writeFileSync(spec, data);
  console.log(
    `\t\t\t  👤 Added Genesis Authority ${decorators.green(
      name
    )} - ${decorators.magenta(sr_stash.address)}`
  );
}

// Add parachains to the chain spec at genesis.
export async function addParachainToGenesis(
  spec_path: string,
  para_id: string,
  head: string,
  wasm: string,
  parachain: boolean = true
) {
  let rawdata = fs.readFileSync(spec_path);
  let chainSpec = JSON.parse(rawdata);

  // Check runtime_genesis_config key for rococo compatibility.
  const runtimeConfig =
    chainSpec.genesis.runtime?.runtime_genesis_config ||
    chainSpec.genesis.runtime;
  let paras = undefined;
  if (runtimeConfig.paras) {
    paras = runtimeConfig.paras.paras;
  }
  // For retro-compatibility with substrate pre Polkadot 0.9.5
  else if (runtimeConfig.parachainsParas) {
    paras = runtimeConfig.parachainsParas.paras;
  }
  if (paras) {
    let new_para = [
      parseInt(para_id),
      [readDataFile(head), readDataFile(wasm), parachain],
    ];

    paras.push(new_para);

    let data = JSON.stringify(chainSpec, null, 2);
    fs.writeFileSync(spec_path, data);
    console.log(
      `\n\t\t  ${decorators.green("✓ Added Genesis Parachain")} ${para_id}`
    );
  } else {
    console.error(
      `\n\t\t  ${decorators.red("  ⚠ paras not found in runtimeConfig")}`
    );
    process.exit(1);
  }
}

// Update the runtime config in the genesis.
// It will try to match keys which exist within the configuration and update the value.
export async function changeGenesisConfig(spec_path: string, updates: any) {
  let rawdata = fs.readFileSync(spec_path);
  let chainSpec = JSON.parse(rawdata);
  const msg = `⚙ Updating Chain Genesis Configuration (path: ${spec_path})`;
  console.log(
    `\n\t\t ${decorators.green(msg)}`
  );

  if (chainSpec.genesis) {
    let config = chainSpec.genesis;
    findAndReplaceConfig(updates, config);

    let data = JSON.stringify(chainSpec, null, 2);
    fs.writeFileSync(spec_path, data);
  }
}

export async function addBootNodes(spec_path: string, addresses: string[]) {
  let rawdata = fs.readFileSync(spec_path);
  let chainSpec = JSON.parse(rawdata);
  // prevent dups bootnodes
  chainSpec.bootNodes = [...new Set(addresses)];
  let data = JSON.stringify(chainSpec, null, 2);

  fs.writeFileSync(spec_path, data);
  if (addresses.length) {
    console.log(
      `\n\t\t ${decorators.green("⚙ Added Boot Nodes: ")} ${addresses}`
    );
  } else {
    console.log(`\n\t\t ${decorators.green("⚙ Clear Boot Nodes")}`);
  }
}

export async function addHrmpChannelsToGenesis(
  spec_path: string,
  hrmpChannels: HrmpChannelsConfig[]
) {
  console.log("⛓ Adding Genesis HRMP Channels");
  let rawdata = fs.readFileSync(spec_path);
  let chainSpec = JSON.parse(rawdata);

  for (const hrmpChannel of hrmpChannels) {
    let newHrmpChannel = [
      hrmpChannel.sender,
      hrmpChannel.recipient,
      hrmpChannel.maxCapacity,
      hrmpChannel.maxMessageSize,
    ];

    // Check runtime_genesis_config key for rococo compatibility.
    const runtimeConfig =
      chainSpec.genesis.runtime.runtime_genesis_config ||
      chainSpec.genesis.runtime;

    let hrmp = undefined;

    if (runtimeConfig.hrmp) {
      hrmp = runtimeConfig.hrmp;
    }
    // For retro-compatibility with substrate pre Polkadot 0.9.5
    else if (runtimeConfig.parachainsHrmp) {
      hrmp = runtimeConfig.parachainsHrmp;
    }

    if (hrmp && hrmp.preopenHrmpChannels) {
      hrmp.preopenHrmpChannels.push(newHrmpChannel);

      console.log(
        `  ✓ Added HRMP channel ${hrmpChannel.sender} -> ${hrmpChannel.recipient}`
      );
    } else {
      console.error("  ⚠ hrmp not found in runtimeConfig");
      process.exit(1);
    }

    let data = JSON.stringify(chainSpec, null, 2);
    fs.writeFileSync(spec_path, data);
  }
}

// Look at the key + values from `obj1` and try to replace them in `obj2`.
function findAndReplaceConfig(obj1: any, obj2: any) {
  // Look at keys of obj1
  Object.keys(obj1).forEach((key) => {
    // See if obj2 also has this key
    if (obj2.hasOwnProperty(key)) {
      // If it goes deeper, recurse...
      if (
        obj1[key] !== null &&
        obj1[key] !== undefined &&
        JSON.parse(JSON.stringify(obj1[key])).constructor === Object
      ) {
        findAndReplaceConfig(obj1[key], obj2[key]);
      } else {
        obj2[key] = obj1[key];
        console.log(
          `\n\t\t  ${decorators.green(
            "✓ Updated Genesis Configuration"
            )} [ key : ${key} ]`
        );
        debug(`[ ${key}: ${JSON.parse(JSON.stringify(obj2))[key]} ]`);
      }
    } else {
      console.error(
        `\n\t\t  ${decorators.red("⚠ Bad Genesis Configuration")} [ ${key}: ${
          obj1[key]
        } ]`
      );
    }
  });
}
