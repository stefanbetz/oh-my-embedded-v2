import { powerCalculator } from "./power-calculator"
import { impedanceCalculator } from "./impedance-calculator"
import { resistorDivider } from "./resistor-divider"
import { pinMapper } from "./pin-mapper"
import { decouplingAdvisor } from "./decoupling-advisor"

export function createTools() {
  return [
    { name: "embedded-power-calculator", ...powerCalculator },
    { name: "embedded-impedance-calculator", ...impedanceCalculator },
    { name: "embedded-resistor-divider", ...resistorDivider },
    { name: "embedded-pin-mapper", ...pinMapper },
    { name: "embedded-decoupling-advisor", ...decouplingAdvisor },
  ]
}
