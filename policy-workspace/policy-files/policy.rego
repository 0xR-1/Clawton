package clawton_policy

import future.keywords

default allow := false

is_admin if {
    input.from == data.params.admin_address
}

is_whitelisted_token if {
    some addr in data.params.allowed_tokens
    addr == input.to
}

within_spend_limit if {
    to_number(input.value) <= data.params.max_value_wei
}

not_withdrawal if {
    input.function.name != "withdraw"
}

allow if {
    is_admin
}

allow if {
    is_whitelisted_token
    within_spend_limit
    not_withdrawal
}
